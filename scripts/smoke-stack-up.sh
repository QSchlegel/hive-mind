#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/smoke-common.sh"

on_error() {
  local code="$?"
  set +e
  smoke_error "smoke stack failed to start"
  print_default_log_tails
  exit "$code"
}
trap on_error ERR

bash "$ROOT_DIR/scripts/bootstrap-local.sh"
load_env_file "$ROOT_DIR/.env"
ensure_local_dirs

export SMOKE_DATABASE_URL="${SMOKE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
export SMOKE_IPFS_API_URL="${SMOKE_IPFS_API_URL:-http://127.0.0.1:5001/api/v0}"
export DATABASE_URL="$SMOKE_DATABASE_URL"
export IPFS_API_URL="$SMOKE_IPFS_API_URL"
export VAULT_MIRROR_REPO_URL="${VAULT_MIRROR_REPO_URL:-$ROOT_DIR/.local/vault-mirror.git}"
export VAULT_MIRROR_WORKDIR="${VAULT_MIRROR_WORKDIR:-.local/vault-mirror}"
if [ -z "${APP_JWT_SECRET:-}" ] || [ "${#APP_JWT_SECRET}" -lt 32 ]; then
  smoke_warn "APP_JWT_SECRET is missing or too short; using deterministic smoke secret"
  export APP_JWT_SECRET="smoke-local-secret-with-32-plus-characters"
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ] || [ "${#BETTER_AUTH_SECRET}" -lt 16 ]; then
  smoke_warn "BETTER_AUTH_SECRET is missing or too short; using deterministic smoke secret"
  export BETTER_AUTH_SECRET="smoke-local-better-auth-secret"
fi

export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://127.0.0.1:3000}"
export TREASURY_ADMIN_EMAIL_ALLOWLIST="${TREASURY_ADMIN_EMAIL_ALLOWLIST:-smoke-admin@hive-mind.club}"

# Always start from a clean smoke state.
bash "$ROOT_DIR/scripts/smoke-stack-down.sh" >/dev/null 2>&1 || true

infra_started=0
if [ "$SMOKE_INFRA_MODE" = "local" ]; then
  smoke_log "starting local smoke infrastructure (postgres + ipfs)"
  smoke_compose up -d
  infra_started=1
else
  smoke_log "SMOKE_INFRA_MODE=${SMOKE_INFRA_MODE}; assuming postgres and ipfs are already available"
fi

wait_for_postgres "$DATABASE_URL" "$SMOKE_TIMEOUT_SECONDS"

ipfs_started_at="$(date +%s)"
while true; do
  if curl -fsS -X POST "$IPFS_API_URL/version" >/dev/null 2>&1; then
    break
  fi

  now="$(date +%s)"
  if (( now - ipfs_started_at >= SMOKE_TIMEOUT_SECONDS )); then
    smoke_error "timed out waiting for ipfs api: $IPFS_API_URL"
    exit 1
  fi
  sleep 2
done

if [[ "$VAULT_MIRROR_REPO_URL" == *"://"* ]]; then
  smoke_error "VAULT_MIRROR_REPO_URL must be a local filesystem path for deterministic smoke runs"
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  smoke_error "port 3000 is already in use; stop existing processes before starting smoke stack"
  lsof -nP -iTCP:3000 -sTCP:LISTEN || true
  exit 1
fi

WEB_DEV_LOCK="$ROOT_DIR/apps/web/.next/dev/lock"
if [ -f "$WEB_DEV_LOCK" ]; then
  smoke_warn "removing stale Next.js dev lock: $WEB_DEV_LOCK"
  rm -f "$WEB_DEV_LOCK"
fi

export DB_CONTAINER="postgres"
export DB_COMPOSE_FILE="$SMOKE_COMPOSE_FILE"
unset DB_COMPOSE_ENV_FILE || true

smoke_log "running database migrations and seed"
bash "$ROOT_DIR/scripts/db-migrate.sh"
bash "$ROOT_DIR/scripts/db-seed.sh"

bash "$ROOT_DIR/scripts/init-local-mirror.sh" "$VAULT_MIRROR_REPO_URL"

WEB_PID=$(start_bg_process web env \
  NODE_ENV="${NODE_ENV:-development}" \
  DATABASE_URL="$DATABASE_URL" \
  APP_JWT_SECRET="$APP_JWT_SECRET" \
  APP_DOMAIN="${APP_DOMAIN:-hive-mind.club}" \
  PUBLIC_SUPABASE_URL="${PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}" \
  PUBLIC_SUPABASE_ANON_KEY="${PUBLIC_SUPABASE_ANON_KEY:-replace-with-local-anon-key}" \
  CHAIN_EVM_ENABLED="${CHAIN_EVM_ENABLED:-true}" \
  CHAIN_CARDANO_ENABLED="${CHAIN_CARDANO_ENABLED:-true}" \
  CHAIN_BITCOIN_ENABLED="${CHAIN_BITCOIN_ENABLED:-true}" \
  BITCOIN_NETWORK="${BITCOIN_NETWORK:-mainnet}" \
  IPFS_API_URL="$IPFS_API_URL" \
  VAULT_MIRROR_REPO_URL="$VAULT_MIRROR_REPO_URL" \
  VAULT_MIRROR_WORKDIR="$VAULT_MIRROR_WORKDIR" \
  npm run dev --workspace @hive-mind/web -- --webpack --hostname 127.0.0.1 --port 3000)

WORKER_PID=$(start_bg_process worker env \
  NODE_ENV="${NODE_ENV:-development}" \
  DATABASE_URL="$DATABASE_URL" \
  APP_JWT_SECRET="$APP_JWT_SECRET" \
  APP_DOMAIN="${APP_DOMAIN:-hive-mind.club}" \
  CHAIN_EVM_ENABLED="${CHAIN_EVM_ENABLED:-true}" \
  CHAIN_CARDANO_ENABLED="${CHAIN_CARDANO_ENABLED:-true}" \
  CHAIN_BITCOIN_ENABLED="${CHAIN_BITCOIN_ENABLED:-true}" \
  BITCOIN_NETWORK="${BITCOIN_NETWORK:-mainnet}" \
  IPFS_API_URL="$IPFS_API_URL" \
  VAULT_MIRROR_REPO_URL="$VAULT_MIRROR_REPO_URL" \
  VAULT_MIRROR_WORKDIR="$VAULT_MIRROR_WORKDIR" \
  WORKER_POLL_INTERVAL_MS="${WORKER_POLL_INTERVAL_MS:-1000}" \
  WORKER_MAX_ATTEMPTS="${WORKER_MAX_ATTEMPTS:-6}" \
  GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Hive Mind Worker}" \
  GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-worker@hive-mind.club}" \
  npm run dev --workspace @hive-mind/worker)

sleep 2
assert_pid_running "$WEB_PID" web
assert_pid_running "$WORKER_PID" worker

wait_for_http "http://127.0.0.1:3000" "$SMOKE_TIMEOUT_SECONDS"
wait_for_http "http://127.0.0.1:3000/api/graph" "$SMOKE_TIMEOUT_SECONDS"

cat > "$SMOKE_PIDS_FILE" <<PIDS
WEB_PID=$WEB_PID
WORKER_PID=$WORKER_PID
SMOKE_INFRA_MODE=$SMOKE_INFRA_MODE
SMOKE_INFRA_STARTED=$infra_started
PIDS

smoke_log "smoke stack is ready"
smoke_log "  web:    http://127.0.0.1:3000"
smoke_log "  graph:  http://127.0.0.1:3000/api/graph"
smoke_log "  db:     $DATABASE_URL"
smoke_log "  ipfs:   $IPFS_API_URL"
