import base64

import numpy as np
import pytest

from lerobot_lens.services.demo_dataset import (
    DEMO_NOISE_MIN_STD,
    DEMO_NOISE_STD_RATIO,
    DemoDataset,
)


@pytest.fixture(scope="module")
def dataset() -> DemoDataset:
    return DemoDataset()


def test_demo_metadata_and_episode_summary(dataset: DemoDataset) -> None:
    episode = dataset.episodes()[0]
    assert dataset.episode_count == 1
    assert episode.index == 0
    assert episode.length == dataset.length == 193
    assert episode.duration == pytest.approx(dataset.length / dataset.fps)
    assert len(dataset.joint_names) == len(dataset.action_names) == 6


def test_demo_state_clamps_frame_and_rejects_episode(dataset: DemoDataset) -> None:
    assert dataset.state(0, -1) == dataset.states[0].astype(float).tolist()
    assert dataset.state(0, dataset.length) == dataset.states[-1].astype(float).tolist()
    with pytest.raises(IndexError, match="only episode 0"):
        dataset.state(1, 0)


def test_demo_frame_contains_image_and_clamped_data(dataset: DemoDataset) -> None:
    frame = dataset.frame(0, -1)
    encoded = next(iter(frame.images.values())).removeprefix("data:image/jpeg;base64,")
    assert frame.frame == 0
    assert frame.timestamp == pytest.approx(float(dataset.timestamps[0]))
    assert frame.state == dataset.states[0].astype(float).tolist()
    assert frame.action == dataset.action_values[0].astype(float).tolist()
    assert base64.b64decode(encoded).startswith(b"\xff\xd8")

    final_frame = dataset.frame(0, dataset.length)
    assert final_frame.frame == dataset.length - 1
    assert final_frame.state == dataset.states[-1].astype(float).tolist()
    assert final_frame.action == dataset.action_values[-1].astype(float).tolist()
    with pytest.raises(IndexError, match="only episode 0"):
        dataset.frame(1, 0)


def test_demo_actions_return_full_episode(dataset: DemoDataset) -> None:
    actions = dataset.actions(0)
    assert actions.fps == dataset.fps
    assert actions.action_names == list(dataset.action_names)
    assert np.asarray(actions.actions).shape == dataset.action_values.shape
    with pytest.raises(IndexError, match="only episode 0"):
        dataset.actions(1)


def test_demo_inference_is_deterministic_clamped_and_scaled(dataset: DemoDataset) -> None:
    first = dataset.infer(0, 180, chunk_size=48)
    replay = dataset.infer(0, 180, chunk_size=48)
    assert first == replay
    assert first.start_frame == 180
    assert first.chunk_size == dataset.length - 180

    predicted = np.asarray(first.predicted_actions)
    truth = np.asarray(first.ground_truth_actions)
    assert predicted.shape == truth.shape
    assert not np.array_equal(predicted, truth)

    expected_std = np.maximum(
        np.std(dataset.action_values.astype(float), axis=0) * DEMO_NOISE_STD_RATIO,
        DEMO_NOISE_MIN_STD,
    )
    assert np.all(np.abs(predicted - truth) < expected_std * 4)

    full_episode = dataset.infer(0, 0, chunk_size=dataset.length)
    full_noise = np.asarray(full_episode.predicted_actions) - np.asarray(
        full_episode.ground_truth_actions
    )
    normalized_rms = np.sqrt(np.mean(np.square(full_noise / expected_std), axis=0))
    assert np.all((normalized_rms > 0.75) & (normalized_rms < 1.25))
    assert dataset.infer(0, -3, chunk_size=1).start_frame == 0
    with pytest.raises(IndexError, match="only episode 0"):
        dataset.infer(1, 0)
