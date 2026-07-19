from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..schemas import EpisodeSummary, SessionCreate, SessionSummary


@dataclass
class RuntimeSession:
    """In-memory resources owned by one evaluation session."""

    id: str
    config: SessionCreate
    summary: SessionSummary
    dataset: Any = None
    policy: Any = None
    preprocessor: Any = None
    postprocessor: Any = None
    episode_ranges: dict[int, tuple[int, int]] = field(default_factory=dict)
    episodes_cache: list[EpisodeSummary] = field(default_factory=list)
    urdf_text: str = ""
    urdf_root: Path | None = None
    inference_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
