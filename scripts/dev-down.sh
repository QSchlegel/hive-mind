#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .local/dev-pids ]; then
  # shellcheck disable=SC1091
  source .local/dev-pids
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" >/dev/null 2>&1 || true
  [ -n "${WORKER_PID:-}" ] && kill "$WORKER_PID" >/dev/null 2>&1 || true
  [ -n "${STRIPE_PID:-}" ] && kill "$STRIPE_PID" >/dev/null 2>&1 || true
fi

docker compose -f infra/railway/ipfs-compose.yml down || true

if [ "${SUPABASE_MODE:-}" = "cli" ] && command -v supabase >/dev/null 2>&1; then
  supabase stop --workdir infra/supabase >/tmp/hive-mind-supabase-stop.log 2>&1 || true
fi

if [ "${SUPABASE_MODE:-}" = "compose" ] || [ -z "${SUPABASE_MODE:-}" ]; then
  docker compose -f infra/supabase/docker-compose.core.yml --env-file infra/supabase/.env down || true
fi

rm -f .local/dev-pids

echo "[dev:down] services stopped"
