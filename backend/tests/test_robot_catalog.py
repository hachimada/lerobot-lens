from pathlib import Path

import pytest

from lerobot_lens.services.robot_catalog import (
    BundledRobot,
    get_bundled_robot,
    resolve_bundled_urdf,
)


def test_bundled_robot_uri_is_derived_from_id() -> None:
    robot = BundledRobot(id="arm", name="Arm", urdf_path=Path("arm.urdf"))
    assert robot.uri == "builtin://arm"


def test_catalog_resolves_known_robot_and_non_builtin_path() -> None:
    robot = get_bundled_robot("so101")
    assert robot.uri == "builtin://so101"
    assert robot.urdf_path.is_file()
    assert resolve_bundled_urdf(robot.uri) == robot.urdf_path
    assert resolve_bundled_urdf("/tmp/robot.urdf") is None


def test_catalog_error_lists_available_robots() -> None:
    with pytest.raises(ValueError, match=r"Unknown bundled robot 'missing'.*so101"):
        get_bundled_robot("missing")
    with pytest.raises(ValueError, match="Unknown bundled robot"):
        resolve_bundled_urdf("builtin://missing")
