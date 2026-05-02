#!/usr/bin/env bash
# Поднимает локальный full-stack: Postgres (Docker) + backend (:3000) + frontend (:5173).
# Ctrl+C — остановит всё разом.
#
# Usage: ./dev.sh

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! docker ps --filter name=lms-postgres --filter status=running -q | grep -q .; then
  echo "→ Postgres не запущен, поднимаю..."
  (cd "$ROOT" && docker compose up -d) >/dev/null
  sleep 2
fi

[ -d "$ROOT/web/backend/node_modules" ] || (echo "→ npm ci backend..." && cd "$ROOT/web/backend" && npm ci)
[ -d "$ROOT/web/frontend/node_modules" ] || (echo "→ npm ci frontend..." && cd "$ROOT/web/frontend" && npm ci)

pids=()
cleanup() {
  echo
  echo "→ останавливаю..."
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo
echo "→ backend  http://localhost:3000"
echo "→ frontend http://localhost:5173"
echo "→ Ctrl+C чтобы остановить"
echo

(cd "$ROOT/web/backend" && exec npm run dev) &
pids+=($!)

(cd "$ROOT/web/frontend" && exec npm run dev) &
pids+=($!)

wait
