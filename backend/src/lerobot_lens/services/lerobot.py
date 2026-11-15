from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, cast

import numpy as np
import torch

from ..schemas import EpisodeActions, EpisodeSummary, FrameData, InferResult
from .media import image_data_url, tensor_list
from .runtime import RuntimeSession

# LeRobot shares one cached torchcodec VideoDecoder per video file across all
# threads and datasets, and a decoder is not thread-safe. FastAPI serves frame
# and inference requests on concurrent worker threads (and keeps running ones
# the browser has aborted), so concurrent decodes of the same file crash the
# process in the native AV1 decoder. Serialize every sample read process-wide.
_SAMPLE_READ_LOCK = threading.Lock()

# LeRobot's DEFAULT_STORAGE_FORMAT (parquet + mp4), kept literal so importing this
# module does not import LeRobot. Other formats, such as Lance in v0.7, expose no
# column access, so their recorded actions come from decoded samples read in
# batches of this size; frame requests can take the decode lock between batches.
_DEFAULT_STORAGE_FORMAT = "lerobot"
_ACTION_READ_BATCH = 64


def load_dataset(runtime: RuntimeSession) -> None:
    """Load and index a LeRobot v0.7 dataset into a runtime session."""

    # Keep LeRobot lazy so demo mode and API startup do not import its full
    # dataset and video stack.
    from lerobot.datasets.lerobot_dataset import LeRobotDataset

    source = Path(runtime.config.dataset).expanduser()
    kwargs: dict[str, Any] = {}
    if source.exists():
        kwargs["root"] = source
        repo_id = source.name
    else:
        repo_id = runtime.config.dataset
    runtime.dataset = LeRobotDataset(repo_id, **kwargs)
    _index_dataset(runtime)


def _index_dataset(runtime: RuntimeSession) -> None:
    dataset = runtime.dataset
    meta = dataset.meta
    fps = float(meta.fps)
    camera_keys = list(getattr(meta, "camera_keys", []))
    if not camera_keys:
        features = getattr(meta, "features", {})
        camera_keys = [key for key in features if key.startswith("observation.image")]

    rows: list[dict[str, Any]] = []
    episodes_meta = getattr(meta, "episodes", None)
    if episodes_meta is not None:
        try:
            rows = [dict(row) for row in episodes_meta]
        except TypeError:
            rows = []
    if not rows:
        episode_indices = dataset.hf_dataset["episode_index"]
        for episode_index in sorted(set(int(value) for value in episode_indices)):
            length = sum(int(value) == episode_index for value in episode_indices)
            rows.append({"episode_index": episode_index, "length": length})

    cursor = 0
    episodes: list[EpisodeSummary] = []
    for row in rows:
        index = int(row.get("episode_index", len(episodes)))
        length = int(row.get("length", row.get("num_frames", 0)))
        start = int(row.get("dataset_from_index", row.get("from", cursor)))
        end = int(row.get("dataset_to_index", row.get("to", start + length)))
        if length <= 0:
            length = end - start
        task = row.get("task", "")
        if not task and row.get("tasks"):
            task = ", ".join(row["tasks"])
        runtime.episode_ranges[index] = (start, start + length)
        episodes.append(
            EpisodeSummary(index=index, length=length, duration=length / fps, task=str(task))
        )
        cursor = start + length

    first_sample = _sample(runtime, 0)
    state_key = _state_key(first_sample)
    first_action = tensor_list(first_sample["action"])
    features = getattr(meta, "features", {})

    state_feature = features.get(state_key, {}) if isinstance(features, dict) else {}
    joint_names = list(state_feature.get("names") or []) if isinstance(state_feature, dict) else []
    if not joint_names:
        joint_names = [
            f"joint_{index + 1}" for index in range(len(tensor_list(first_sample[state_key])))
        ]

    action_feature = features.get("action", {}) if isinstance(features, dict) else {}
    action_names = (
        list(action_feature.get("names") or []) if isinstance(action_feature, dict) else []
    )
    if not action_names:
        action_names = [f"action_{index + 1}" for index in range(len(first_action))]

    runtime.episodes_cache = episodes
    runtime.summary = runtime.summary.model_copy(
        update={
            "fps": fps,
            "episode_count": len(episodes),
            "camera_keys": camera_keys,
            "state_key": state_key,
            "action_dim": len(first_action),
            "joint_names": joint_names,
            "action_names": action_names,
        }
    )


def _state_key(sample: dict[str, Any]) -> str:
    candidates = ("observation.state", "observation.environment_state", "state")
    return next((key for key in candidates if key in sample), "observation.state")


def load_policy(runtime: RuntimeSession) -> None:
    from lerobot.configs.policies import PreTrainedConfig
    from lerobot.policies.factory import get_policy_class, make_pre_post_processors

    config = PreTrainedConfig.from_pretrained(runtime.config.policy)
    # Checkpoints and their processor pipelines persist the training device
    # independently, so both must be moved to the selected runtime device.
    config.device = runtime.summary.device
    policy_class = get_policy_class(config.type)
    runtime.policy = policy_class.from_pretrained(runtime.config.policy, config=config)
    runtime.policy.to(runtime.summary.device)
    runtime.policy.eval()
    runtime.preprocessor, runtime.postprocessor = make_pre_post_processors(
        policy_cfg=config,
        pretrained_path=runtime.config.policy,
        preprocessor_overrides={
            "device_processor": {"device": runtime.summary.device},
        },
    )


def episode_actions(runtime: RuntimeSession, episode: int) -> EpisodeActions:
    start, end = _episode_range(runtime, episode)
    return EpisodeActions(
        episode=episode,
        fps=runtime.summary.fps or 30,
        action_names=runtime.summary.action_names,
        actions=_recorded_actions(runtime, start, end),
    )


def frame(runtime: RuntimeSession, episode: int, frame_index: int) -> FrameData:
    start, end = _episode_range(runtime, episode)
    index = start + frame_index
    if index < start or index >= end:
        raise IndexError("Frame outside episode")
    sample = _sample(runtime, index)
    images = {
        key: image_data_url(sample[key]) for key in runtime.summary.camera_keys if key in sample
    }
    return FrameData(
        episode=episode,
        frame=frame_index,
        timestamp=float(sample.get("timestamp", frame_index / (runtime.summary.fps or 30))),
        state=tensor_list(sample[runtime.summary.state_key or "observation.state"]),
        action=tensor_list(sample["action"]),
        images=images,
    )


def infer(runtime: RuntimeSession, episode: int, frame_index: int) -> InferResult:
    start, end = _episode_range(runtime, episode)
    index = start + frame_index
    if index < start or index >= end:
        raise IndexError("Frame outside episode")

    # Each request is an independent query at an arbitrary frame, so no policy
    # or processor state from a previous request may leak into it.
    runtime.policy.reset()
    for processor in (runtime.preprocessor, runtime.postprocessor):
        if processor is not None:
            processor.reset()

    with torch.inference_mode():
        if _predicts_chunks_directly(runtime.policy):
            actions = _action_tensor(
                runtime.policy.predict_action_chunk(_policy_input(runtime, index))
            )
        else:
            actions = _select_action_chunk(runtime, start, index)
        if runtime.postprocessor:
            actions = runtime.postprocessor(actions)

    predicted = actions.detach().cpu().squeeze(0).numpy()
    if predicted.ndim == 1:
        predicted = predicted[None, :]
    count = min(len(predicted), end - index)
    predicted = predicted[:count]
    ground_truth = np.asarray(_recorded_actions(runtime, index, index + count))
    return InferResult(
        episode=episode,
        start_frame=frame_index,
        fps=runtime.summary.fps or 30,
        predicted_actions=predicted.tolist(),
        ground_truth_actions=ground_truth.tolist(),
        chunk_size=count,
    )


def _predicts_chunks_directly(policy: Any) -> bool:
    """Return whether ``predict_action_chunk`` works from the current observation alone.

    LeRobot policies declare this contract through ``chunk_inference_spec``, which
    rejects policies that need observation history or ``select_action``-only
    preparation, such as Diffusion and Multi-Task DiT.
    """
    try:
        policy.chunk_inference_spec()
    except ValueError:
        return False
    return True


def _select_action_chunk(runtime: RuntimeSession, start: int, index: int) -> torch.Tensor:
    """Predict one chunk through ``select_action`` with the policy's observation history.

    Frames before the episode start are omitted; the policy pads its history by
    repeating the oldest observation, as it does during training.
    """
    policy = runtime.policy
    n_obs_steps = max(1, int(getattr(policy.config, "n_obs_steps", None) or 1))
    for history_index in range(max(start, index - n_obs_steps + 1), index):
        policy.select_action(_policy_input(runtime, history_index))
    # Feeding history may already have queued actions predicted from a partial
    # history; drop them so the chunk is predicted from the requested frame.
    policy.drop_queued_actions()
    batch = _policy_input(runtime, index)
    actions = [_action_tensor(policy.select_action(batch))]
    while policy.count_queued_actions() > 0:
        actions.append(_action_tensor(policy.select_action(batch)))
    return torch.stack(actions, dim=1)


def _policy_input(runtime: RuntimeSession, index: int) -> dict[str, Any]:
    """Build a preprocessed single-frame policy input batch from a dataset sample."""
    sample = _sample(runtime, index)
    batch: dict[str, Any] = {}
    for key, value in sample.items():
        if not key.startswith("observation."):
            continue
        tensor = value if isinstance(value, torch.Tensor) else torch.as_tensor(value)
        batch[key] = tensor.unsqueeze(0).to(runtime.summary.device)
    # Language-conditioned policies such as SmolVLA and pi0 tokenize the task
    # in their preprocessor and fail without it.
    task = sample.get("task")
    batch["task"] = [task if isinstance(task, str) else ""]
    return cast(dict[str, Any], runtime.preprocessor(batch)) if runtime.preprocessor else batch


def _action_tensor(output: Any) -> torch.Tensor:
    """Extract actions from a policy output, which may also carry a prediction."""
    if isinstance(output, dict):
        return cast(torch.Tensor, output["action"])
    return cast(torch.Tensor, output)


def _recorded_actions(runtime: RuntimeSession, start: int, end: int) -> list[list[float]]:
    """Read the recorded actions of dataset frames ``[start, end)``."""
    dataset = runtime.dataset
    if getattr(dataset.meta, "storage_format", _DEFAULT_STORAGE_FORMAT) == _DEFAULT_STORAGE_FORMAT:
        # The default format reads the action column without decoding video.
        table = dataset.hf_dataset
        return [tensor_list(table[index]["action"]) for index in range(start, end)]
    actions: list[list[float]] = []
    for batch_start in range(start, end, _ACTION_READ_BATCH):
        indices = list(range(batch_start, min(batch_start + _ACTION_READ_BATCH, end)))
        with _SAMPLE_READ_LOCK:
            samples = dataset.__getitems__(indices)
        actions.extend(tensor_list(sample["action"]) for sample in samples)
    return actions


def _sample(runtime: RuntimeSession, index: int) -> dict[str, Any]:
    """Read one decoded dataset sample under the process-wide decode lock."""
    with _SAMPLE_READ_LOCK:
        return cast(dict[str, Any], runtime.dataset[index])


def _episode_range(runtime: RuntimeSession, episode: int) -> tuple[int, int]:
    try:
        return runtime.episode_ranges[episode]
    except KeyError as exc:
        raise IndexError("Episode not found") from exc
