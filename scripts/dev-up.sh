#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/bootstrap-local.sh
bash scripts/init-local-mirror.sh

mkdir -p .local/logs

SUPABASE_MODE=""
SUPABASE_COMPOSE_ARGS=(-f infra/supabase/docker-compose.core.yml --env-file infra/supabase/.env)

if command -v supabase >/dev/null 2>&1; then
  echo "[dev:up] starting supabase local stack — first run may pull images, progress below"
  if supabase start --workdir infra/supabase 2>&1 | tee /tmp/hive-mind-supabase.log; then
    SUPABASE_MODE="cli"
  else
    echo "[dev:up] supabase CLI start failed, falling back to docker compose — see /tmp/hive-mind-supabase.log"
  fi
fi

if [ -z "$SUPABASE_MODE" ]; then
  echo "[dev:up] starting supabase core stack via docker compose"
  docker compose "${SUPABASE_COMPOSE_ARGS[@]}" up -d
  SUPABASE_MODE="compose"

  echo "[dev:up] waiting for sb-db readiness"
  for _ in $(seq 1 45); do
    if docker compose "${SUPABASE_COMPOSE_ARGS[@]}" exec -T sb-db pg_isready -U postgres >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

echo "[dev:up] starting local IPFS"
docker compose -f infra/railway/ipfs-compose.yml up -d

echo "[dev:up] applying migrations + seed"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" bash scripts/db-migrate.sh
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" bash scripts/db-seed.sh

echo "[dev:up] launching web + worker"
nohup npm run dev --workspace @hive-mind/web > .local/logs/web.log 2>&1 &
WEB_PID=$!
nohup npm run dev --workspace @hive-mind/worker > .local/logs/worker.log 2>&1 &
WORKER_PID=$!

STRIPE_PID=""
if command -v stripe >/dev/null 2>&1; then
  nohup stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook > .local/logs/stripe.log 2>&1 &
  STRIPE_PID=$!
else
  echo "[dev:up] stripe CLI not found, skipping webhook listener"
fi

cat > .local/dev-pids <<PIDS
WEB_PID=$WEB_PID
WORKER_PID=$WORKER_PID
STRIPE_PID=$STRIPE_PID
SUPABASE_MODE=$SUPABASE_MODE
PIDS

echo "[dev:up] ready"
echo "  web:    http://127.0.0.1:3000"
echo "  graph:  http://127.0.0.1:3000/api/graph"
echo "  studio: http://127.0.0.1:54323"
