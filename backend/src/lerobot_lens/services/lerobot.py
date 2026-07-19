from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch

from ..schemas import EpisodeActions, EpisodeSummary, FrameData, InferResult
from .media import image_data_url, tensor_list
from .runtime import RuntimeSession


def load_dataset(runtime: RuntimeSession) -> None:
    """Load and index a LeRobot v0.6 dataset into a runtime session."""

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

    first_sample = dataset[0]
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
        actions=[
            tensor_list(runtime.dataset.hf_dataset[index]["action"]) for index in range(start, end)
        ],
    )


def frame(runtime: RuntimeSession, episode: int, frame_index: int) -> FrameData:
    start, end = _episode_range(runtime, episode)
    index = start + frame_index
    if index < start or index >= end:
        raise IndexError("Frame outside episode")
    sample = runtime.dataset[index]
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
    if start + frame_index < start or start + frame_index >= end:
        raise IndexError("Frame outside episode")
    sample = runtime.dataset[start + frame_index]
    observation: dict[str, Any] = {}
    for key, value in sample.items():
        if not key.startswith("observation."):
            continue
        tensor = value if isinstance(value, torch.Tensor) else torch.as_tensor(value)
        observation[key] = tensor.unsqueeze(0).to(runtime.summary.device)

    with torch.inference_mode():
        batch = runtime.preprocessor(observation) if runtime.preprocessor else observation
        if hasattr(runtime.policy, "predict_action_chunk"):
            actions = runtime.policy.predict_action_chunk(batch)
        else:
            runtime.policy.reset()
            chunk_size = int(getattr(runtime.policy.config, "chunk_size", 1))
            actions = torch.stack(
                [runtime.policy.select_action(batch) for _ in range(chunk_size)], dim=1
            )
        if runtime.postprocessor:
            actions = runtime.postprocessor(actions)

    predicted = actions.detach().cpu().squeeze(0).numpy()
    if predicted.ndim == 1:
        predicted = predicted[None, :]
    count = min(len(predicted), end - (start + frame_index))
    predicted = predicted[:count]
    ground_truth = np.asarray(
        [
            tensor_list(runtime.dataset[start + frame_index + offset]["action"])
            for offset in range(count)
        ]
    )
    return InferResult(
        episode=episode,
        start_frame=frame_index,
        fps=runtime.summary.fps or 30,
        predicted_actions=predicted.tolist(),
        ground_truth_actions=ground_truth.tolist(),
        chunk_size=count,
    )


def _episode_range(runtime: RuntimeSession, episode: int) -> tuple[int, int]:
    try:
        return runtime.episode_ranges[episode]
    except KeyError as exc:
        raise IndexError("Episode not found") from exc
