from __future__ import annotations

import base64
import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from ..schemas import EpisodeActions, EpisodeSummary, FrameData, InferResult

DEMO_ASSETS_ROOT = Path(__file__).parents[1] / "resources" / "demo"
DEMO_METADATA = json.loads((DEMO_ASSETS_ROOT / "metadata.json").read_text())
DEMO_NOISE_STD_RATIO = 0.03
DEMO_NOISE_MIN_STD = 1e-3
DEMO_CHUNK_SIZE = 48


@lru_cache(maxsize=64)
def _frame_data_url(frame: int) -> str:
    image = (DEMO_ASSETS_ROOT / "frames" / f"{frame + 1:06d}.jpg").read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(image).decode()


class DemoDataset:
    def __init__(self) -> None:
        with np.load(DEMO_ASSETS_ROOT / "episode_000.npz") as episode:
            self.states = episode["states"].copy()
            self.action_values = episode["actions"].copy()
            self.timestamps = episode["timestamps"].copy()
        self.fps = float(DEMO_METADATA["fps"])
        self.episode_count = 1
        self.length = len(self.states)
        self.camera_keys = (str(DEMO_METADATA["camera_key"]),)
        self.joint_names = tuple(DEMO_METADATA["state_names"])
        self.action_names = tuple(DEMO_METADATA["action_names"])
        self.task = str(DEMO_METADATA["task"])

    def episodes(self) -> list[EpisodeSummary]:
        return [
            EpisodeSummary(
                index=0,
                length=self.length,
                duration=self.length / self.fps,
                task=self.task,
            )
        ]

    def state(self, episode: int, frame: int) -> list[float]:
        if episode != 0:
            raise IndexError("Demo contains only episode 0")
        frame = max(0, min(frame, self.length - 1))
        return [float(value) for value in self.states[frame]]

    def frame(self, episode: int, frame: int) -> FrameData:
        if episode != 0:
            raise IndexError("Demo contains only episode 0")
        frame = max(0, min(frame, self.length - 1))
        return FrameData(
            episode=episode,
            frame=frame,
            timestamp=float(self.timestamps[frame]),
            state=self.states[frame].astype(float).tolist(),
            action=self.action_values[frame].astype(float).tolist(),
            images={self.camera_keys[0]: _frame_data_url(frame)},
        )

    def actions(self, episode: int) -> EpisodeActions:
        if episode != 0:
            raise IndexError("Demo contains only episode 0")
        return EpisodeActions(
            episode=episode,
            fps=self.fps,
            action_names=list(self.action_names),
            actions=self.action_values.astype(float).tolist(),
        )

    def infer(self, episode: int, frame: int, chunk_size: int = DEMO_CHUNK_SIZE) -> InferResult:
        if episode != 0:
            raise IndexError("Demo contains only episode 0")
        frame = max(0, min(frame, self.length - 1))
        end = min(self.length, frame + chunk_size)
        ground_truth = self.action_values[frame:end].astype(float)
        # Scale the demo error to each joint instead of applying the same absolute
        # offset to joints with very different ranges. A frame-derived seed keeps
        # replaying the same inference request deterministic.
        joint_std = np.std(self.action_values.astype(float), axis=0)
        noise_std = np.maximum(joint_std * DEMO_NOISE_STD_RATIO, DEMO_NOISE_MIN_STD)
        rng = np.random.default_rng(np.random.SeedSequence([episode, frame, chunk_size]))
        predicted = ground_truth + rng.normal(0.0, noise_std, ground_truth.shape)
        return InferResult(
            episode=episode,
            start_frame=frame,
            fps=self.fps,
            predicted_actions=predicted.tolist(),
            ground_truth_actions=ground_truth.tolist(),
            chunk_size=len(predicted),
        )
