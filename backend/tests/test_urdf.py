from pathlib import Path

import pytest

from lerobot_lens.services.robot_catalog import get_bundled_robot
from lerobot_lens.services.urdf import (
    load_urdf,
    resolve_urdf_asset,
    resolve_urdf_joint_name,
    validate_urdf_joint_mapping,
)


def test_load_urdf_handles_absent_local_builtin_and_invalid_sources(tmp_path: Path) -> None:
    assert load_urdf(None) is None
    assert load_urdf("") is None

    local = tmp_path / "robot.urdf"
    local.write_text('<robot name="local" />')
    document = load_urdf(str(local))
    assert document is not None
    assert document.text == '<robot name="local" />'
    assert document.root == tmp_path

    robot = get_bundled_robot("so101")
    bundled = load_urdf(robot.uri)
    assert bundled is not None
    assert bundled.root == robot.urdf_path.parent

    with pytest.raises(ValueError, match="local path or built-in robot"):
        load_urdf("hf://models/org/robot.urdf")


def test_resolve_urdf_asset_checks_assets_root_and_blocks_traversal(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    assets.mkdir()
    nested = assets / "mesh.stl"
    nested.write_bytes(b"mesh")
    root_file = tmp_path / "root.stl"
    root_file.write_bytes(b"root")
    outside = tmp_path.parent / "outside.stl"
    outside.write_bytes(b"outside")

    assert resolve_urdf_asset(tmp_path, "mesh.stl") == nested
    assert resolve_urdf_asset(tmp_path, "root.stl") == root_file
    assert resolve_urdf_asset(tmp_path, "../outside.stl") is None
    assert resolve_urdf_asset(tmp_path, "missing.stl") is None


@pytest.mark.parametrize(
    ("source", "mapping", "expected"),
    [
        ("shoulder.pos", {}, "shoulder"),
        ("motor.pos", {"motor.pos": "shoulder"}, "shoulder"),
        ("motor.pos", {"motor": "shoulder"}, "shoulder"),
        ("plain", {}, "plain"),
    ],
)
def test_resolve_urdf_joint_name(source: str, mapping: dict[str, str], expected: str) -> None:
    assert resolve_urdf_joint_name(source, mapping) == expected


def test_validate_joint_mapping_accepts_normalized_and_explicit_names() -> None:
    urdf = """
    <robot name="test">
      <joint name="shoulder" type="revolute" />
      <joint name="wrist" type="continuous" />
      <joint name="camera" type="fixed" />
    </robot>
    """
    validate_urdf_joint_mapping(["shoulder.pos"], urdf, {})
    validate_urdf_joint_mapping(["motor.pos"], urdf, {"motor.pos": "wrist"})


def test_validate_joint_mapping_reports_missing_and_available_names() -> None:
    urdf = '<robot><joint name="shoulder" type="revolute" /></robot>'
    with pytest.raises(ValueError) as captured:
        validate_urdf_joint_mapping(["motor.pos"], urdf, {})
    message = str(captured.value)
    assert "motor.pos" in message
    assert "shoulder" in message
    assert '{"motor.pos": "shoulder"}' in message


def test_validate_joint_mapping_handles_urdf_without_movable_joints() -> None:
    with pytest.raises(ValueError, match=r"Available URDF movable joints: \(none\)"):
        validate_urdf_joint_mapping(
            ["motor.pos"], '<robot><joint name="fixed" type="fixed" /></robot>', {}
        )
