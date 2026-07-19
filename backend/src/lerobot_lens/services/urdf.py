from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from .robot_catalog import resolve_bundled_urdf


@dataclass(frozen=True)
class UrdfDocument:
    text: str
    root: Path


def load_urdf(source_value: str | None) -> UrdfDocument | None:
    if not source_value:
        return None
    source = resolve_bundled_urdf(source_value) or Path(source_value).expanduser()
    if not source.is_file():
        raise ValueError("URDF must be a local path or built-in robot")
    return UrdfDocument(text=source.read_text(), root=source.parent)


def resolve_urdf_asset(root: Path, asset_path: str) -> Path | None:
    """Resolve an asset relative to a URDF without allowing path traversal."""

    resolved_root = root.resolve()
    for base in (resolved_root / "assets", resolved_root):
        target = (base / asset_path).resolve()
        if target.is_relative_to(resolved_root) and target.is_file():
            return target
    return None


def resolve_urdf_joint_name(source_name: str, mapping: dict[str, str]) -> str:
    normalized_name = source_name.removesuffix(".pos")
    return mapping.get(source_name, mapping.get(normalized_name, normalized_name))


def validate_urdf_joint_mapping(
    dataset_joint_names: list[str], urdf_text: str, mapping: dict[str, str]
) -> None:
    root = ET.fromstring(urdf_text)
    urdf_joint_names = [
        joint.attrib["name"]
        for joint in root.findall("joint")
        if joint.attrib.get("type") != "fixed" and "name" in joint.attrib
    ]
    available = set(urdf_joint_names)
    missing = [
        name
        for name in dataset_joint_names
        if resolve_urdf_joint_name(name, mapping) not in available
    ]
    if not missing:
        return
    example = {missing[0]: urdf_joint_names[0] if urdf_joint_names else "<urdf_joint_name>"}
    raise ValueError(
        "Joint mapping is incomplete. "
        f"Unmapped dataset joints: {', '.join(missing)}. "
        f"Available URDF movable joints: {', '.join(urdf_joint_names) or '(none)'}. "
        'Joint Map uses {"dataset_joint_name":"urdf_joint_name"}; '
        f"example format for this session: {json.dumps(example)}. "
        "Verify the semantic pairing before loading."
    )
