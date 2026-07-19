.DEFAULT_GOAL := help

.PHONY: help install run dev backend frontend format format-check lint typecheck test test-e2e build check

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; print "Usage: make <target>\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install backend and frontend dependencies
	cd backend && uv sync
	cd frontend && npm ci

run: build ## Build and start the local app on http://localhost:8000
	cd backend && uv run python -m uvicorn lerobot_lens.main:app --port 8000

dev: ## Start the backend and frontend development servers
	./scripts/dev.sh

backend: ## Start the FastAPI development server on port 8001
	cd backend && uv run python -m uvicorn lerobot_lens.main:app --reload --port 8001

frontend: ## Start the Vite development server
	cd frontend && npm run dev

format: ## Format backend and frontend source files
	cd backend && uv run ruff format src tests
	cd frontend && npm run format

format-check: ## Verify source formatting
	cd backend && uv run ruff format --check src tests
	cd frontend && npm run format:check

lint: ## Run backend and frontend linters
	cd backend && uv run ruff check src tests
	cd frontend && npm run lint

typecheck: ## Run backend static type checks
	cd backend && uv run python -m mypy

test: ## Run backend and frontend automated tests
	cd backend && uv run python -m pytest
	cd frontend && npm test

test-e2e: ## Run the bundled demo browser smoke test
	cd frontend && npm run test:e2e

build: ## Build the frontend production bundle
	cd frontend && npm run build

check: format-check lint typecheck test build ## Run all checks used before committing
