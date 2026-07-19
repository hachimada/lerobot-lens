# Development Guide

## Setup

Install the backend and frontend dependencies from the repository root:

```bash
make install
```

## Development server

```bash
make dev
```

Open `http://localhost:8000` in a browser. The development environment starts:

- Vite on port 8000 with React hot reload
- FastAPI on port 8001 with Python reload
- A Vite proxy from `/api` to FastAPI

Both ports must be available. Press `Ctrl+C` to stop both processes.

You can also start each process separately with `make frontend` and `make backend`. Set `VITE_API_TARGET` to change the frontend's API target.

The OpenAPI UI is available at `http://localhost:8001/docs` during development.

## Production-style local server

```bash
make run
```

This builds the frontend and starts FastAPI on port 8000. FastAPI serves both the API and `frontend/dist`. The OpenAPI UI is available at `http://localhost:8000/docs`.

## Quality checks

Run the complete check suite before committing:

```bash
make check
```

Individual targets are also available:

| Target | Purpose |
| --- | --- |
| `make format` | Format backend and frontend sources |
| `make format-check` | Check formatting without modifying files |
| `make lint` | Run Ruff and ESLint |
| `make typecheck` | Run mypy |
| `make test` | Run backend and frontend unit tests |
| `make test-e2e` | Run the Chromium E2E smoke test with the bundled demo |
| `make build` | Create the production frontend build |

`make test` also enforces a minimum of 95% backend branch coverage and 80% per-file frontend coverage. The frontend coverage report excludes only entry points, type declarations, and test fixtures.

Install Chromium before running E2E tests for the first time:

```bash
cd frontend && npx playwright install chromium
```

`make test-e2e` builds the frontend and automatically starts the single-port setup served by FastAPI. It does not use external data or a GPU.

## Continuous integration

The `CI` workflow runs on pushes to `main` and through manual dispatch. It installs locked backend and frontend dependencies, runs `make check`, uploads backend and frontend coverage to Codecov using OIDC, and runs the bundled demo E2E test in Chromium.

## Project structure

```text
backend/src/lerobot_lens/
├── api/          FastAPI routes
├── resources/    Bundled demo and robot assets
└── services/     Sessions, LeRobot integration, media, and URDF processing

frontend/src/
├── app/          Application composition and state management
├── features/     Setup and evaluation features
└── shared/       API client and transport types

scripts/          Repository-wide development scripts
```

The backend uses Python, FastAPI, uv, and LeRobot. The frontend uses TypeScript, React, Three.js, and `urdf-loader`.
