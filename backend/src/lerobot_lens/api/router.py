from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from ..config import settings
from ..schemas import (
    BundledRobotSummary,
    EpisodeActions,
    EpisodeSummary,
    FrameData,
    InferRequest,
    InferResult,
    SessionCreate,
    SessionSummary,
)
from ..services.robot_catalog import BUNDLED_ROBOTS
from ..services.sessions import manager
from ..services.urdf import resolve_urdf_asset

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "name": settings.app_name}


@router.get("/robots", response_model=list[BundledRobotSummary])
def get_bundled_robots() -> list[BundledRobotSummary]:
    return [
        BundledRobotSummary(id=robot.id, name=robot.name, urdf=robot.uri)
        for robot in BUNDLED_ROBOTS
    ]


@router.post("/sessions", response_model=SessionSummary, status_code=202)
async def create_session(payload: SessionCreate) -> SessionSummary:
    return await manager.create(payload)


@router.get("/sessions/{session_id}", response_model=SessionSummary)
def get_session(session_id: str) -> SessionSummary:
    try:
        return manager.get(session_id).summary
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/sessions/{session_id}/episodes", response_model=list[EpisodeSummary])
def get_episodes(session_id: str) -> list[EpisodeSummary]:
    try:
        return manager.episodes(session_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/sessions/{session_id}/episodes/{episode}/actions", response_model=EpisodeActions)
def get_episode_actions(session_id: str, episode: int) -> EpisodeActions:
    try:
        return manager.episode_actions(session_id, episode)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(416, str(exc)) from exc


@router.get("/sessions/{session_id}/episodes/{episode}/frames/{frame}", response_model=FrameData)
def get_frame(session_id: str, episode: int, frame: int) -> FrameData:
    try:
        return manager.frame(session_id, episode, frame)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except IndexError as exc:
        raise HTTPException(416, str(exc)) from exc


@router.post("/sessions/{session_id}/infer", response_model=InferResult)
async def infer(session_id: str, payload: InferRequest) -> InferResult:
    try:
        return await manager.infer(session_id, payload.episode, payload.frame)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (IndexError, RuntimeError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/sessions/{session_id}/urdf")
def get_urdf(session_id: str) -> Response:
    try:
        text = manager.get(session_id).urdf_text
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not text:
        raise HTTPException(404, "No URDF was configured for this session")
    return Response(text, media_type="application/xml")


@router.get("/sessions/{session_id}/assets/{asset_path:path}")
def get_urdf_asset(session_id: str, asset_path: str) -> FileResponse:
    try:
        root = manager.get(session_id).urdf_root
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    if root is None:
        raise HTTPException(404, "URDF has no local asset root")
    target = resolve_urdf_asset(root, asset_path)
    if target is None:
        raise HTTPException(404, "Asset not found")
    return FileResponse(target)
