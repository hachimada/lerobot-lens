from pathlib import Path

from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseModel):
    app_name: str = "LeRobot Lens"
    cors_origins: tuple[str, ...] = ("http://localhost:8000", "http://127.0.0.1:8000")
    max_sessions: int = 4
    default_dataset: str = "hachimada/so101_pick_place_red_1"
    default_policy: str = "hachimada/act_so101_pick_place_red_1"
    frontend_dist: Path = PROJECT_ROOT / "frontend" / "dist"


settings = Settings()
