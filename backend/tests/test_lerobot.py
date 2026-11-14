from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest
import torch

from lerobot_lens.services import lerobot
from lerobot_lens.services.runtime import RuntimeSession
from tests.factories import runtime_session


class FakeTable:
    def __init__(self, samples: list[dict[str, Any]]) -> None:
        self.samples = samples

    def __getitem__(self, index: int | str) -> Any:
        if isinstance(index, str):
            return [sample[index] for sample in self.samples]
        return self.samples[index]


class FakeDataset:
    def __init__(self, samples: list[dict[str, Any]], meta: Any) -> None:
        self.samples = samples
        self.hf_dataset = FakeTable(samples)
        self.meta = meta

    def __getitem__(self, index: int) -> dict[str, Any]:
        return self.samples[index]


def test_lerobot_v07_api_surface_is_available() -> None:
    """Fail offline when the installed LeRobot API no longer matches our adapter."""
    from lerobot.configs.policies import PreTrainedConfig
    from lerobot.datasets.lerobot_dataset import LeRobotDataset
    from lerobot.policies.factory import get_policy_class, make_pre_post_processors

    assert callable(LeRobotDataset)
    assert callable(PreTrainedConfig.from_pretrained)
    assert callable(get_policy_class)
    assert callable(make_pre_post_processors)


def make_samples() -> list[dict[str, Any]]:
    return [
        {
            "episode_index": 0 if index < 2 else 1,
            "observation.state": torch.tensor([index, index + 0.5]),
            "observation.images.front": np.zeros((2, 3, 3), dtype=np.uint8),
            "action": torch.tensor([index + 1.0, index + 2.0]),
            "timestamp": index / 20,
        }
        for index in range(4)
    ]


def test_index_dataset_uses_episode_metadata_and_feature_names() -> None:
    meta = SimpleNamespace(
        fps=20,
        camera_keys=["observation.images.front"],
        episodes=[
            {"episode_index": 0, "length": 2, "dataset_from_index": 0, "tasks": ["pick"]},
            {"episode_index": 1, "length": 2, "dataset_from_index": 2, "task": "place"},
        ],
        features={
            "observation.state": {"names": ["joint_a", "joint_b"]},
            "action": {"names": ["action_a", "action_b"]},
        },
    )
    runtime = runtime_session()
    runtime.dataset = FakeDataset(make_samples(), meta)

    lerobot._index_dataset(runtime)

    assert runtime.episode_ranges == {0: (0, 2), 1: (2, 4)}
    assert [episode.task for episode in runtime.episodes_cache] == ["pick", "place"]
    assert runtime.summary.fps == 20
    assert runtime.summary.camera_keys == ["observation.images.front"]
    assert runtime.summary.joint_names == ["joint_a", "joint_b"]
    assert runtime.summary.action_names == ["action_a", "action_b"]


def test_index_dataset_falls_back_to_frame_indices_and_generated_names() -> None:
    samples = make_samples()
    samples[0]["observation.environment_state"] = samples[0].pop("observation.state")
    for sample in samples[1:]:
        sample["observation.environment_state"] = sample.pop("observation.state")
    meta = SimpleNamespace(
        fps=10,
        camera_keys=[],
        episodes=None,
        features={"observation.images.front": {}, "action": {}},
    )
    runtime = runtime_session()
    runtime.dataset = FakeDataset(samples, meta)

    lerobot._index_dataset(runtime)

    assert runtime.episode_ranges == {0: (0, 2), 1: (2, 4)}
    assert runtime.summary.state_key == "observation.environment_state"
    assert runtime.summary.joint_names == ["joint_1", "joint_2"]
    assert runtime.summary.action_names == ["action_1", "action_2"]


def test_index_dataset_recovers_from_invalid_metadata_and_range_only_rows() -> None:
    samples = make_samples()
    invalid_meta = SimpleNamespace(fps=10, camera_keys=[], episodes=1, features={})
    fallback = runtime_session()
    fallback.dataset = FakeDataset(samples, invalid_meta)
    lerobot._index_dataset(fallback)
    assert fallback.episode_ranges == {0: (0, 2), 1: (2, 4)}

    range_meta = SimpleNamespace(
        fps=10,
        camera_keys=[],
        episodes=[{"episode_index": 0, "length": 0, "from": 0, "to": 2}],
        features={},
    )
    ranged = runtime_session()
    ranged.dataset = FakeDataset(samples, range_meta)
    lerobot._index_dataset(ranged)
    assert ranged.episode_ranges == {0: (0, 2)}
    assert ranged.episodes_cache[0].length == 2


@pytest.mark.parametrize(
    ("sample", "expected"),
    [
        ({"observation.state": 1}, "observation.state"),
        ({"observation.environment_state": 1}, "observation.environment_state"),
        ({"state": 1}, "state"),
        ({}, "observation.state"),
    ],
)
def test_state_key_prefers_supported_names(sample: dict[str, Any], expected: str) -> None:
    assert lerobot._state_key(sample) == expected


def test_episode_actions_and_frame_convert_dataset_values() -> None:
    runtime = runtime_session()
    runtime.dataset = FakeDataset(make_samples(), SimpleNamespace())
    runtime.episode_ranges = {0: (0, 2)}
    runtime.summary.fps = 20
    runtime.summary.action_names = ["a", "b"]
    runtime.summary.state_key = "observation.state"
    runtime.summary.camera_keys = ["observation.images.front", "missing"]

    actions = lerobot.episode_actions(runtime, 0)
    frame = lerobot.frame(runtime, 0, 1)
    assert actions.actions == [[1.0, 2.0], [2.0, 3.0]]
    assert frame.timestamp == pytest.approx(0.05)
    assert frame.state == [1.0, 1.5]
    assert list(frame.images) == ["observation.images.front"]

    with pytest.raises(IndexError, match="Episode not found"):
        lerobot.episode_actions(runtime, 9)
    with pytest.raises(IndexError, match="Frame outside episode"):
        lerobot.frame(runtime, 0, -1)
    with pytest.raises(IndexError, match="Frame outside episode"):
        lerobot.frame(runtime, 0, 2)


def test_frame_uses_timestamp_fallback() -> None:
    samples = make_samples()
    samples[0].pop("timestamp")
    runtime = runtime_session()
    runtime.dataset = FakeDataset(samples, SimpleNamespace())
    runtime.episode_ranges = {0: (0, 1)}
    runtime.summary.fps = 20
    runtime.summary.state_key = "observation.state"
    assert lerobot.frame(runtime, 0, 0).timestamp == 0


class ChunkPolicy:
    def predict_action_chunk(self, batch: dict[str, torch.Tensor]) -> torch.Tensor:
        assert batch["observation.state"].shape == (1, 2)
        return torch.tensor([[[10.0, 11.0], [12.0, 13.0], [14.0, 15.0]]])


class SelectPolicy:
    config = SimpleNamespace(chunk_size=2)

    def __init__(self) -> None:
        self.reset_called = False

    def reset(self) -> None:
        self.reset_called = True

    def select_action(self, batch: dict[str, torch.Tensor]) -> torch.Tensor:
        assert "action" not in batch
        return torch.tensor([[7.0, 8.0]])


def inference_runtime(policy: Any) -> RuntimeSession:
    runtime = runtime_session()
    runtime.dataset = FakeDataset(make_samples(), SimpleNamespace())
    runtime.episode_ranges = {0: (0, 2)}
    runtime.summary.fps = 20
    runtime.policy = policy
    return runtime


def test_infer_uses_action_chunk_pipeline_and_truncates_at_episode_end() -> None:
    runtime = inference_runtime(ChunkPolicy())
    runtime.preprocessor = lambda batch: batch
    runtime.postprocessor = lambda actions: actions + 1
    result = lerobot.infer(runtime, 0, 1)
    assert result.predicted_actions == [[11.0, 12.0]]
    assert result.ground_truth_actions == [[2.0, 3.0]]
    assert result.chunk_size == 1


def test_infer_falls_back_to_select_action() -> None:
    policy = SelectPolicy()
    result = lerobot.infer(inference_runtime(policy), 0, 0)
    assert policy.reset_called is True
    assert result.predicted_actions == [[7.0, 8.0], [7.0, 8.0]]
    assert result.chunk_size == 2


def test_infer_normalizes_a_single_action_vector() -> None:
    class SinglePolicy:
        def predict_action_chunk(self, _batch: dict[str, torch.Tensor]) -> torch.Tensor:
            return torch.tensor([[9.0, 10.0]])

    result = lerobot.infer(inference_runtime(SinglePolicy()), 0, 0)
    assert result.predicted_actions == [[9.0, 10.0]]
    assert result.chunk_size == 1


def test_infer_rejects_frame_outside_episode() -> None:
    with pytest.raises(IndexError, match="Frame outside episode"):
        lerobot.infer(inference_runtime(ChunkPolicy()), 0, 2)


def test_load_dataset_uses_hub_id_and_local_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    class Loader:
        def __init__(self, repo_id: str, **kwargs: Any) -> None:
            calls.append((repo_id, kwargs))

    monkeypatch.setattr("lerobot.datasets.lerobot_dataset.LeRobotDataset", Loader)
    monkeypatch.setattr(lerobot, "_index_dataset", lambda runtime: None)

    hub_runtime = runtime_session(dataset="org/data")
    lerobot.load_dataset(hub_runtime)
    local = tmp_path / "dataset"
    local.mkdir()
    local_runtime = runtime_session(dataset=str(local))
    lerobot.load_dataset(local_runtime)

    assert calls == [("org/data", {}), ("dataset", {"root": local})]


def test_load_policy_moves_model_and_processor_to_runtime_device(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from lerobot.configs.policies import PreTrainedConfig
    from lerobot.policies import factory

    policy_config = SimpleNamespace(type="act", device="cuda")
    calls: list[tuple[str, str]] = []

    class Policy:
        def to(self, device: str) -> None:
            calls.append(("to", device))

        def eval(self) -> None:
            calls.append(("eval", ""))

    policy = Policy()

    class PolicyClass:
        @staticmethod
        def from_pretrained(path: str, config: Any) -> Policy:
            assert path == "org/policy"
            assert config.device == "mps"
            return policy

    processor_args: dict[str, Any] = {}

    def processors(**kwargs: Any) -> tuple[str, str]:
        processor_args.update(kwargs)
        return "pre", "post"

    monkeypatch.setattr(PreTrainedConfig, "from_pretrained", lambda _path: policy_config)
    monkeypatch.setattr(factory, "get_policy_class", lambda _type: PolicyClass)
    monkeypatch.setattr(factory, "make_pre_post_processors", processors)
    runtime = runtime_session(policy="org/policy", device="mps")

    lerobot.load_policy(runtime)

    assert runtime.policy is policy
    assert runtime.preprocessor == "pre"
    assert runtime.postprocessor == "post"
    assert calls == [("to", "mps"), ("eval", "")]
    assert processor_args["preprocessor_overrides"] == {"device_processor": {"device": "mps"}}
