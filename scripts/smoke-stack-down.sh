#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/smoke-common.sh"

load_smoke_pids

stop_pid_if_running "${WEB_PID:-}" web
stop_pid_if_running "${WORKER_PID:-}" worker

should_down_infra=0
if [ "${SMOKE_INFRA_MODE:-local}" = "local" ]; then
  should_down_infra=1
fi
if [ "${SMOKE_INFRA_STARTED:-0}" = "1" ]; then
  should_down_infra=1
fi

if [ "$should_down_infra" -eq 1 ] && [ -f "$SMOKE_COMPOSE_FILE" ]; then
  smoke_compose down -v --remove-orphans >/dev/null 2>&1 || true
fi

rm -f "$SMOKE_PIDS_FILE"

smoke_log "smoke stack stopped"
