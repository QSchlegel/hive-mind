#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/smoke-common.sh"

export SMOKE_DATABASE_URL="${SMOKE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
export SMOKE_IPFS_API_URL="${SMOKE_IPFS_API_URL:-http://127.0.0.1:5001/api/v0}"

cleanup() {
  local code="$?"
  if [ "${KEEP_SMOKE_STACK_UP:-0}" = "1" ]; then
    smoke_warn "KEEP_SMOKE_STACK_UP=1 set; leaving smoke stack running"
    return "$code"
  fi

  bash "$ROOT_DIR/scripts/smoke-stack-down.sh" || true
  return "$code"
}
trap cleanup EXIT

bash "$ROOT_DIR/scripts/smoke-stack-up.sh"
bash "$ROOT_DIR/scripts/smoke-e2e.sh"

smoke_log "local end-to-end smoke finished successfully"
