from pathlib import Path
from typing import cast

import pytest
from fastapi.testclient import TestClient

from lerobot_lens.main import create_app
from lerobot_lens.services.sessions import manager
from tests.factories import runtime_session

client = TestClient(create_app(Path("/nonexistent/frontend")))


def create_demo() -> dict[str, object]:
    response = client.post(
        "/api/sessions",
        json={"dataset": "demo", "policy": None, "device": "cpu", "demo": True},
    )
    assert response.status_code == 202
    return cast(dict[str, object], response.json())


def test_health_and_robot_catalog_endpoints() -> None:
    assert client.get("/api/health").json() == {
        "status": "ok",
        "name": "LeRobot Lens",
    }
    assert client.get("/api/robots").json() == [
        {"id": "so101", "name": "SO-101 (SO-ARM100)", "urdf": "builtin://so101"}
    ]


@pytest.mark.parametrize("joint_mapping", [[], None, "joint", 12, {"source": 1}])
def test_create_session_rejects_non_string_joint_maps(joint_mapping: object) -> None:
    response = client.post(
        "/api/sessions",
        json={"dataset": "data", "joint_mapping": joint_mapping},
    )

    assert response.status_code == 422
    assert manager._sessions == {}


def test_demo_endpoints_form_a_complete_local_flow() -> None:
    session = create_demo()
    session_id = str(session["id"])
    assert session["status"] == "ready"

    episodes = client.get(f"/api/sessions/{session_id}/episodes")
    frame = client.get(f"/api/sessions/{session_id}/episodes/0/frames/3")
    actions = client.get(f"/api/sessions/{session_id}/episodes/0/actions")
    inference = client.post(f"/api/sessions/{session_id}/infer", json={"episode": 0, "frame": 20})

    assert episodes.status_code == 200
    assert episodes.json()[0]["length"] == 193
    assert frame.status_code == 200
    assert frame.json()["frame"] == 3
    assert len(frame.json()["images"]) == 1
    assert actions.status_code == 200
    assert len(actions.json()["actions"]) == 193
    assert inference.status_code == 200
    assert inference.json()["chunk_size"] == 48
    assert client.get(f"/api/sessions/{session_id}/urdf").status_code == 200
    assert client.get(f"/api/sessions/{session_id}/assets/base_so101_v2.stl").status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/sessions/missing", None),
        ("get", "/api/sessions/missing/episodes", None),
        ("get", "/api/sessions/missing/episodes/0/actions", None),
        ("get", "/api/sessions/missing/episodes/0/frames/0", None),
        ("get", "/api/sessions/missing/urdf", None),
        ("get", "/api/sessions/missing/assets/mesh.stl", None),
        ("post", "/api/sessions/missing/infer", {"episode": 0, "frame": 0}),
    ],
)
def test_session_endpoints_return_not_found(
    method: str, path: str, body: dict[str, int] | None
) -> None:
    response = client.request(method, path, json=body)
    assert response.status_code == 404
    assert "Session not found" in response.json()["detail"]


def test_episode_and_asset_errors_have_specific_status_codes() -> None:
    session_id = str(create_demo()["id"])
    assert client.get(f"/api/sessions/{session_id}/episodes/9/actions").status_code == 416
    assert client.get(f"/api/sessions/{session_id}/episodes/9/frames/0").status_code == 416
    assert (
        client.post(
            f"/api/sessions/{session_id}/infer", json={"episode": 9, "frame": 0}
        ).status_code
        == 400
    )
    missing_asset = client.get(f"/api/sessions/{session_id}/assets/missing.stl")
    assert missing_asset.status_code == 404
    assert missing_asset.json()["detail"] == "Asset not found"


def test_urdf_endpoints_distinguish_missing_document_and_asset_root() -> None:
    runtime = runtime_session()
    runtime.id = runtime.summary.id = "without-urdf"
    manager._sessions[runtime.id] = runtime
    no_document = client.get(f"/api/sessions/{runtime.id}/urdf")
    no_root = client.get(f"/api/sessions/{runtime.id}/assets/mesh.stl")
    assert no_document.status_code == 404
    assert no_document.json()["detail"] == "No URDF was configured for this session"
    assert no_root.status_code == 404
    assert no_root.json()["detail"] == "URDF has no local asset root"


def test_frontend_bundle_is_served_without_shadowing_api(tmp_path: Path) -> None:
    frontend = tmp_path / "dist"
    frontend.mkdir()
    (frontend / "index.html").write_text("<html><body>LeRobot Lens UI</body></html>")
    static_client = TestClient(create_app(frontend))

    root = static_client.get("/")
    assert root.status_code == 200
    assert "LeRobot Lens UI" in root.text
    assert static_client.get("/api/health").json()["status"] == "ok"
