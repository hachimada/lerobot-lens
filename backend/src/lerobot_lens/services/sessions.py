from __future__ import annotations

import asyncio
import logging
import uuid
from collections import OrderedDict
from typing import cast

from ..config import settings
from ..schemas import (
    EpisodeActions,
    EpisodeSummary,
    FrameData,
    InferResult,
    SessionCreate,
    SessionSummary,
)
from . import lerobot
from .demo_dataset import DEMO_CHUNK_SIZE, DemoDataset
from .device import choose_device
from .robot_catalog import get_bundled_robot
from .runtime import RuntimeSession
from .urdf import load_urdf, validate_urdf_joint_mapping

logger = logging.getLogger(__name__)


class SessionManager:
    """Own session lifecycle and delegate artifact-specific work to services."""

    def __init__(self) -> None:
        self._sessions: OrderedDict[str, RuntimeSession] = OrderedDict()
        self._lock = asyncio.Lock()

    async def create(self, config: SessionCreate) -> SessionSummary:
        session_id = uuid.uuid4().hex[:12]
        summary = SessionSummary(
            id=session_id,
            status="loading",
            dataset=config.dataset,
            policy=config.policy,
            device=choose_device(config.device),
            message="Loading dataset metadata…",
            joint_mapping=config.joint_mapping,
            dataset_angle_unit=config.dataset_angle_unit,
            demo=config.demo,
        )
        runtime = RuntimeSession(id=session_id, config=config, summary=summary)
        await self._store(runtime)

        if config.demo:
            self._load_demo(runtime)
        else:
            asyncio.create_task(asyncio.to_thread(self._load_real, runtime))
        return runtime.summary

    async def _store(self, runtime: RuntimeSession) -> None:
        async with self._lock:
            self._sessions[runtime.id] = runtime
            while len(self._sessions) > settings.max_sessions:
                self._sessions.popitem(last=False)

    def get(self, session_id: str) -> RuntimeSession:
        try:
            runtime = self._sessions[session_id]
        except KeyError as exc:
            raise KeyError("Session not found or evicted") from exc
        self._sessions.move_to_end(session_id)
        return runtime

    def _load_demo(self, runtime: RuntimeSession) -> None:
        dataset = DemoDataset()
        robot = get_bundled_robot("so101")
        runtime.dataset = dataset
        runtime.episodes_cache = dataset.episodes()
        runtime.urdf_text = robot.urdf_path.read_text()
        runtime.urdf_root = robot.urdf_path.parent
        runtime.summary = runtime.summary.model_copy(
            update={
                "status": "ready",
                "message": "Bundled sample episode ready",
                "dataset": "hachimada/so101_pick_place_red_1 · Episode 0",
                "policy": "Dataset trajectory + slight noise",
                "fps": dataset.fps,
                "episode_count": dataset.episode_count,
                "camera_keys": list(dataset.camera_keys),
                "state_key": "observation.state",
                "action_dim": len(dataset.joint_names),
                "joint_names": list(dataset.joint_names),
                "action_names": list(dataset.action_names),
                "dataset_angle_unit": "degrees",
                "has_urdf": True,
                "action_chunk_size": DEMO_CHUNK_SIZE,
            }
        )

    def _load_real(self, runtime: RuntimeSession) -> None:
        try:
            lerobot.load_dataset(runtime)
            self._load_urdf(runtime)
            if runtime.urdf_text:
                validate_urdf_joint_mapping(
                    list(
                        dict.fromkeys([*runtime.summary.joint_names, *runtime.summary.action_names])
                    ),
                    runtime.urdf_text,
                    runtime.config.joint_mapping,
                )
            runtime.summary.message = (
                "Loading policy…" if runtime.config.policy else "Dataset ready"
            )
            if runtime.config.policy:
                lerobot.load_policy(runtime)
            runtime.summary.status = "ready"
            runtime.summary.message = (
                "Dataset and policy ready" if runtime.policy else "Dataset ready"
            )
        except Exception as exc:  # Background failures must remain visible to polling clients.
            logger.exception("Failed to load LeRobot Lens session")
            runtime.summary.status = "error"
            runtime.summary.message = f"{type(exc).__name__}: {exc}"

    @staticmethod
    def _load_urdf(runtime: RuntimeSession) -> None:
        document = load_urdf(runtime.config.urdf)
        if document is None:
            return
        runtime.urdf_text = document.text
        runtime.urdf_root = document.root
        runtime.summary.has_urdf = True

    def episodes(self, session_id: str) -> list[EpisodeSummary]:
        return self.get(session_id).episodes_cache

    def episode_actions(self, session_id: str, episode: int) -> EpisodeActions:
        runtime = self.get(session_id)
        if runtime.config.demo:
            return cast(EpisodeActions, runtime.dataset.actions(episode))
        return lerobot.episode_actions(runtime, episode)

    def frame(self, session_id: str, episode: int, frame: int) -> FrameData:
        runtime = self.get(session_id)
        if runtime.config.demo:
            return cast(FrameData, runtime.dataset.frame(episode, frame))
        return lerobot.frame(runtime, episode, frame)

    async def infer(self, session_id: str, episode: int, frame: int) -> InferResult:
        runtime = self.get(session_id)
        async with runtime.inference_lock:
            if runtime.config.demo:
                return cast(InferResult, runtime.dataset.infer(episode, frame))
            if runtime.policy is None:
                raise RuntimeError("No policy was loaded for this session")
            return await asyncio.to_thread(lerobot.infer, runtime, episode, frame)


manager = SessionManager()
