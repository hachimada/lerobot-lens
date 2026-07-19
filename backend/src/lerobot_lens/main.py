from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.router import router
from .config import settings


def create_app(frontend_dir: Path | None = None) -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Inspect LeRobot policy action chunks against recorded datasets",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    static_dir = frontend_dir or settings.frontend_dist
    if (static_dir / "index.html").is_file():
        # Register this catch-all after the API router so API and docs routes win.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
    return app


app = create_app()
