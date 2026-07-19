#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_pid=""
frontend_pid=""

ensure_port_available() {
  local port="$1"
  local listener=""

  if command -v lsof >/dev/null 2>&1; then
    listener="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
  fi
  if [[ -n "$listener" ]]; then
    local process
    process="$(ps -p "$listener" -o comm= 2>/dev/null || true)"
    echo "Error: port $port is already in use by PID $listener (${process:-unknown process})." >&2
    echo "Stop that process before running 'make dev'." >&2
    exit 1
  fi
}

cleanup() {
  trap - EXIT INT TERM
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null || true
  [[ -n "$frontend_pid" ]] && kill "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

shutdown() {
  cleanup
  exit 0
}

ensure_port_available 8000
ensure_port_available 8001

trap cleanup EXIT
trap shutdown INT TERM

(cd "$project_root/backend" && unset VIRTUAL_ENV && exec uv run python -m uvicorn lerobot_lens.main:app --reload --port 8001) &
backend_pid=$!
(cd "$project_root/frontend" && exec npm run dev) &
frontend_pid=$!

echo "App: http://localhost:8000"
echo "Backend API: http://localhost:8001"

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
