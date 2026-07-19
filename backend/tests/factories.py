from lerobot_lens.schemas import SessionCreate, SessionSummary
from lerobot_lens.services.runtime import RuntimeSession


def runtime_session(
    *,
    dataset: str = "test-dataset",
    urdf: str | None = None,
    policy: str | None = None,
    device: str = "cpu",
    demo: bool = False,
) -> RuntimeSession:
    config = SessionCreate(
        dataset=dataset,
        policy=policy,
        urdf=urdf,
        device="cpu",
        dataset_angle_unit="radians" if urdf else None,
        demo=demo,
    )
    summary = SessionSummary(
        id="test-session",
        status="loading",
        dataset=config.dataset,
        policy=config.policy,
        device=device,
        demo=demo,
    )
    return RuntimeSession(id=summary.id, config=config, summary=summary)
