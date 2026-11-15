from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SessionCreate(BaseModel):
    dataset: str = Field(min_length=1)
    policy: str | None = None
    urdf: str | None = None
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"
    joint_mapping: dict[str, str] = Field(default_factory=dict)
    dataset_angle_unit: Literal["degrees", "radians"] | None = None
    demo: bool = False

    @model_validator(mode="after")
    def require_angle_unit_with_urdf(self) -> "SessionCreate":
        if self.urdf and not self.dataset_angle_unit:
            raise ValueError("dataset_angle_unit is required when URDF is configured")
        return self


class SessionSummary(BaseModel):
    id: str
    status: Literal["loading", "ready", "error"]
    dataset: str
    policy: str | None
    device: str
    message: str = ""
    fps: float | None = None
    episode_count: int | None = None
    camera_keys: list[str] = Field(default_factory=list)
    state_key: str | None = None
    action_dim: int | None = None
    joint_names: list[str] = Field(default_factory=list)
    action_names: list[str] = Field(default_factory=list)
    joint_mapping: dict[str, str] = Field(default_factory=dict)
    dataset_angle_unit: Literal["degrees", "radians"] | None = None
    has_urdf: bool = False
    demo: bool = False
    # Actions one inference returns, once a policy is loaded.
    action_chunk_size: int | None = None


class BundledRobotSummary(BaseModel):
    id: str
    name: str
    urdf: str


class EpisodeSummary(BaseModel):
    index: int
    length: int
    duration: float
    task: str = ""


class FrameData(BaseModel):
    episode: int
    frame: int
    timestamp: float
    state: list[float]
    action: list[float]
    images: dict[str, str]


class EpisodeActions(BaseModel):
    episode: int
    fps: float
    action_names: list[str]
    actions: list[list[float]]


class InferRequest(BaseModel):
    episode: int = Field(ge=0)
    frame: int = Field(ge=0)


class InferResult(BaseModel):
    episode: int
    start_frame: int
    fps: float
    predicted_actions: list[list[float]]
    ground_truth_actions: list[list[float]]
    chunk_size: int
