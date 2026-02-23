#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[smoke] checking HTTP endpoints"
curl -fsS http://127.0.0.1:3000 >/dev/null
curl -fsS http://127.0.0.1:3000/api/graph >/dev/null

echo "[smoke] checking DB connectivity"
if command -v psql >/dev/null 2>&1; then
  DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
  psql "$DB_URL" -c "select 1" >/dev/null
fi

echo "[smoke] local stack healthy"
