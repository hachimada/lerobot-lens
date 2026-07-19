import pytest
from pydantic import ValidationError

from lerobot_lens.schemas import InferRequest, SessionCreate, SessionSummary


def test_session_create_defaults_are_independent() -> None:
    first = SessionCreate(dataset="one")
    second = SessionCreate(dataset="two")

    first.joint_mapping["a"] = "b"
    assert second.joint_mapping == {}
    assert first.device == "auto"
    assert first.demo is False


def test_session_create_requires_dataset_and_angle_unit_for_urdf() -> None:
    with pytest.raises(ValidationError, match="String should have at least 1 character"):
        SessionCreate(dataset="")
    with pytest.raises(ValidationError, match="dataset_angle_unit is required"):
        SessionCreate(dataset="data", urdf="robot.urdf")

    configured = SessionCreate(dataset="data", urdf="robot.urdf", dataset_angle_unit="degrees")
    assert configured.dataset_angle_unit == "degrees"


@pytest.mark.parametrize("field", ["episode", "frame"])
def test_infer_request_rejects_negative_indices(field: str) -> None:
    values = {"episode": 0, "frame": 0, field: -1}
    with pytest.raises(ValidationError):
        InferRequest(**values)


def test_session_summary_collection_defaults_are_independent() -> None:
    first = SessionSummary(id="1", status="loading", dataset="data", policy=None, device="cpu")
    second = SessionSummary(id="2", status="ready", dataset="data", policy=None, device="cpu")
    first.camera_keys.append("camera")
    assert second.camera_keys == []
