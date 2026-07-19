import asyncio
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from lerobot_lens.config import settings
from lerobot_lens.schemas import EpisodeActions, EpisodeSummary, FrameData, InferResult
from lerobot_lens.services import lerobot
from lerobot_lens.services.runtime import RuntimeSession
from lerobot_lens.services.sessions import SessionManager
from tests.factories import runtime_session


def demo_runtime() -> RuntimeSession:
    return runtime_session(dataset="demo", demo=True)


@pytest.mark.anyio
async def test_create_demo_stores_ready_session() -> None:
    manager = SessionManager()
    summary = await manager.create(demo_runtime().config)
    runtime = manager.get(summary.id)

    assert summary.status == "ready"
    assert summary.demo is True
    assert summary.episode_count == 1
    assert summary.has_urdf is True
    assert runtime.dataset is not None
    assert runtime.urdf_root is not None


@pytest.mark.anyio
async def test_create_real_schedules_background_loader(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = SessionManager()
    loaded: list[str] = []

    def load_real(_manager: SessionManager, runtime: RuntimeSession) -> None:
        loaded.append(runtime.id)

    async def run_in_thread(function: Callable[..., None], *args: Any) -> None:
        function(*args)

    monkeypatch.setattr(SessionManager, "_load_real", load_real)
    monkeypatch.setattr(asyncio, "to_thread", run_in_thread)
    summary = await manager.create(runtime_session().config)
    assert summary.status == "loading"
    await asyncio.sleep(0)
    assert loaded == [summary.id]


@pytest.mark.anyio
async def test_store_evicts_oldest_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "max_sessions", 2)
    manager = SessionManager()
    runtimes = [runtime_session() for _ in range(3)]
    for index, runtime in enumerate(runtimes):
        runtime.id = str(index)
        runtime.summary.id = str(index)
        await manager._store(runtime)

    with pytest.raises(KeyError, match="evicted"):
        manager.get("0")
    assert manager.get("1").id == "1"
    assert manager.get("2").id == "2"


def test_get_refreshes_lru_order() -> None:
    manager = SessionManager()
    first = runtime_session()
    first.id = first.summary.id = "first"
    second = runtime_session()
    second.id = second.summary.id = "second"
    manager._sessions[first.id] = first
    manager._sessions[second.id] = second

    assert manager.get("first") is first
    assert list(manager._sessions) == ["second", "first"]
    with pytest.raises(KeyError, match="Session not found"):
        manager.get("missing")


def test_load_real_sets_ready_with_and_without_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []

    def load_dataset(runtime: RuntimeSession) -> None:
        events.append("dataset")
        runtime.summary.joint_names = ["joint.pos"]
        runtime.summary.action_names = ["joint.pos"]

    monkeypatch.setattr(lerobot, "load_dataset", load_dataset)
    monkeypatch.setattr(
        SessionManager, "_load_urdf", lambda _manager, _runtime: events.append("urdf")
    )
    monkeypatch.setattr(
        "lerobot_lens.services.sessions.validate_urdf_joint_mapping",
        lambda *args: events.append("map"),
    )

    without_policy = runtime_session()
    SessionManager()._load_real(without_policy)
    assert without_policy.summary.status == "ready"
    assert without_policy.summary.message == "Dataset ready"

    def load_policy(runtime: RuntimeSession) -> None:
        events.append("policy")
        runtime.policy = object()

    monkeypatch.setattr(lerobot, "load_policy", load_policy)
    with_policy = runtime_session(policy="org/policy")
    with_policy.urdf_text = '<robot name="test" />'
    SessionManager()._load_real(with_policy)
    assert with_policy.summary.status == "ready"
    assert with_policy.summary.message == "Dataset and policy ready"
    assert events == ["dataset", "urdf", "dataset", "urdf", "map", "policy"]


def test_load_real_exposes_background_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        lerobot,
        "load_dataset",
        lambda _runtime: (_ for _ in ()).throw(ValueError("broken dataset")),
    )
    runtime = runtime_session()
    SessionManager()._load_real(runtime)
    assert runtime.summary.status == "error"
    assert runtime.summary.message == "ValueError: broken dataset"


def test_load_urdf_handles_absent_and_present_document(tmp_path: Path) -> None:
    manager = SessionManager()
    absent = runtime_session()
    manager._load_urdf(absent)
    assert absent.summary.has_urdf is False

    path = tmp_path / "robot.urdf"
    path.write_text('<robot name="test" />')
    present = runtime_session(urdf=str(path))
    manager._load_urdf(present)
    assert present.urdf_text == '<robot name="test" />'
    assert present.urdf_root == tmp_path
    assert present.summary.has_urdf is True


def store_direct(manager: SessionManager, runtime: RuntimeSession) -> None:
    manager._sessions[runtime.id] = runtime


def test_accessors_delegate_demo_and_real_datasets(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = SessionManager()
    demo = demo_runtime()

    class Demo:
        def actions(self, episode: int) -> EpisodeActions:
            return EpisodeActions(episode=episode, fps=1, action_names=[], actions=[])

        def frame(self, episode: int, frame: int) -> FrameData:
            return FrameData(
                episode=episode, frame=frame, timestamp=0, state=[], action=[], images={}
            )

    demo.dataset = Demo()
    demo.episodes_cache = [EpisodeSummary(index=0, length=1, duration=1)]
    store_direct(manager, demo)
    assert manager.episodes(demo.id) == demo.episodes_cache
    assert manager.episode_actions(demo.id, 0).episode == 0
    assert manager.frame(demo.id, 0, 3).frame == 3

    real = runtime_session()
    real.id = real.summary.id = "real"
    store_direct(manager, real)
    expected_actions = EpisodeActions(episode=2, fps=1, action_names=[], actions=[])
    expected_frame = FrameData(episode=2, frame=4, timestamp=0, state=[], action=[], images={})
    monkeypatch.setattr(lerobot, "episode_actions", lambda _runtime, _episode: expected_actions)
    monkeypatch.setattr(lerobot, "frame", lambda _runtime, _episode, _frame: expected_frame)
    assert manager.episode_actions("real", 2) is expected_actions
    assert manager.frame("real", 2, 4) is expected_frame


@pytest.mark.anyio
async def test_infer_delegates_demo_and_real_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = SessionManager()
    expected = InferResult(
        episode=0,
        start_frame=0,
        fps=1,
        predicted_actions=[[1]],
        ground_truth_actions=[[1]],
        chunk_size=1,
    )

    class Demo:
        def infer(self, episode: int, frame: int) -> InferResult:
            assert (episode, frame) == (0, 2)
            return expected

    demo = demo_runtime()
    demo.dataset = Demo()
    store_direct(manager, demo)
    assert await manager.infer(demo.id, 0, 2) is expected

    real = runtime_session()
    real.id = real.summary.id = "real"
    store_direct(manager, real)
    with pytest.raises(RuntimeError, match="No policy"):
        await manager.infer("real", 0, 0)

    real.policy = object()
    called: list[tuple[int, int]] = []

    def infer(_runtime: RuntimeSession, episode: int, frame: int) -> InferResult:
        called.append((episode, frame))
        return expected

    async def run_in_thread(function: Callable[..., InferResult], *args: Any) -> InferResult:
        return function(*args)

    monkeypatch.setattr(lerobot, "infer", infer)
    monkeypatch.setattr(asyncio, "to_thread", run_in_thread)
    assert await manager.infer("real", 4, 5) is expected
    assert called == [(4, 5)]


@pytest.mark.anyio
async def test_infer_serializes_calls_for_the_same_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = SessionManager()
    runtime = runtime_session(policy="org/policy")
    runtime.policy = object()
    store_direct(manager, runtime)
    entered = asyncio.Event()
    release = asyncio.Event()
    active = 0
    maximum_active = 0

    async def run_in_thread(_function: Callable[..., InferResult], *_args: Any) -> InferResult:
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        entered.set()
        await release.wait()
        active -= 1
        return InferResult(
            episode=0,
            start_frame=0,
            fps=1,
            predicted_actions=[[1]],
            ground_truth_actions=[[1]],
            chunk_size=1,
        )

    monkeypatch.setattr(asyncio, "to_thread", run_in_thread)
    first = asyncio.create_task(manager.infer(runtime.id, 0, 0))
    await entered.wait()
    second = asyncio.create_task(manager.infer(runtime.id, 0, 1))
    await asyncio.sleep(0)

    assert maximum_active == 1
    assert not second.done()

    release.set()
    await asyncio.gather(first, second)
    assert maximum_active == 1
