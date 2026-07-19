from dataclasses import dataclass
from pathlib import Path

BUILTIN_URDF_SCHEME = "builtin://"
ROBOT_ASSETS_ROOT = Path(__file__).parents[1] / "resources" / "robots"


@dataclass(frozen=True)
class BundledRobot:
    id: str
    name: str
    urdf_path: Path

    @property
    def uri(self) -> str:
        return f"{BUILTIN_URDF_SCHEME}{self.id}"


# Add future project robots here. The frontend obtains this list from the API.
BUNDLED_ROBOTS: tuple[BundledRobot, ...] = (
    BundledRobot(
        id="so101",
        name="SO-101 (SO-ARM100)",
        urdf_path=ROBOT_ASSETS_ROOT / "so101/so101_new_calib.urdf",
    ),
)


def get_bundled_robot(robot_id: str) -> BundledRobot:
    try:
        return next(robot for robot in BUNDLED_ROBOTS if robot.id == robot_id)
    except StopIteration as exc:
        available = ", ".join(robot.id for robot in BUNDLED_ROBOTS) or "(none)"
        raise ValueError(
            f"Unknown bundled robot '{robot_id}'. Available robots: {available}"
        ) from exc


def resolve_bundled_urdf(uri: str) -> Path | None:
    if not uri.startswith(BUILTIN_URDF_SCHEME):
        return None
    robot_id = uri.removeprefix(BUILTIN_URDF_SCHEME)
    return get_bundled_robot(robot_id).urdf_path
