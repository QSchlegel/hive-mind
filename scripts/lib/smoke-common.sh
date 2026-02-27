#!/usr/bin/env bash
set -euo pipefail

SMOKE_ROOT_DIR="${SMOKE_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SMOKE_LOG_DIR="${SMOKE_ROOT_DIR}/.local/logs"
SMOKE_PIDS_FILE="${SMOKE_ROOT_DIR}/.local/smoke-pids"
SMOKE_COMPOSE_FILE="${SMOKE_ROOT_DIR}/infra/local/docker-compose.smoke.yml"
SMOKE_COMPOSE_PROJECT="${SMOKE_COMPOSE_PROJECT:-hive-mind-smoke}"
SMOKE_INFRA_MODE="${SMOKE_INFRA_MODE:-local}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-120}"

smoke_log() {
  echo "[smoke] $*"
}

smoke_warn() {
  echo "[smoke][warn] $*" >&2
}

smoke_error() {
  echo "[smoke][error] $*" >&2
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    smoke_error "required command not found: $cmd"
    return 1
  fi
}

ensure_local_dirs() {
  mkdir -p "${SMOKE_ROOT_DIR}/.local"
  mkdir -p "${SMOKE_LOG_DIR}"
}

load_env_file() {
  local env_file="${1:-${SMOKE_ROOT_DIR}/.env}"

  if [ ! -f "$env_file" ]; then
    smoke_warn "env file not found: $env_file (continuing with existing environment)"
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    case "$line" in
      '' | '#'* )
        continue
        ;;
    esac

    if [[ "$line" != *=* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    key="${key#${key%%[![:space:]]*}}"
    key="${key%${key##*[![:space:]]}}"

    if [ -z "$key" ]; then
      continue
    fi

    if [[ "$key" =~ [^A-Za-z0-9_] ]]; then
      continue
    fi

    if [ -n "${!key+x}" ]; then
      continue
    fi

    export "$key=$value"
  done < "$env_file"
}

smoke_compose() {
  docker compose -p "$SMOKE_COMPOSE_PROJECT" -f "$SMOKE_COMPOSE_FILE" "$@"
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="${2:-$SMOKE_TIMEOUT_SECONDS}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS --connect-timeout 5 --max-time 10 "$url" >/dev/null 2>&1; then
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - started_at >= timeout_seconds )); then
      smoke_error "timed out waiting for HTTP endpoint: $url"
      return 1
    fi

    sleep 2
  done
}

wait_for_postgres() {
  local database_url="${1:-${DATABASE_URL:-}}"
  local timeout_seconds="${2:-$SMOKE_TIMEOUT_SECONDS}"

  if [ -z "$database_url" ]; then
    smoke_error "DATABASE_URL is required to wait for postgres"
    return 1
  fi

  DATABASE_URL="$database_url" WAIT_TIMEOUT_SECONDS="$timeout_seconds" node <<'NODE'
const { Client } = require("pg");

const timeoutSeconds = Number(process.env.WAIT_TIMEOUT_SECONDS || "120");
const deadline = Date.now() + timeoutSeconds * 1000;

async function waitForDb() {
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  console.error("[smoke][error] timed out waiting for postgres");
  process.exit(1);
}

waitForDb().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

start_bg_process() {
  local name="$1"
  shift

  ensure_local_dirs
  local log_file="${SMOKE_LOG_DIR}/${name}.log"
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid "$@" >"$log_file" 2>&1 &
  else
    nohup "$@" >"$log_file" 2>&1 &
  fi
  local pid=$!
  smoke_log "started ${name} pid=${pid} log=${log_file}" >&2
  echo "$pid"
}

stop_pid_if_running() {
  local pid="${1:-}"
  local name="${2:-process}"
  local current_pgid
  local target_pid

  if [ -z "$pid" ]; then
    return 0
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  current_pgid="$(ps -o pgid= "$$" 2>/dev/null | tr -d ' ' || true)"
  target_pid="$pid"

  local pgid
  pgid="$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [ -n "$pgid" ] && [ "$pgid" != "$current_pgid" ]; then
    target_pid="-$pgid"
  fi

  kill "$target_pid" >/dev/null 2>&1 || true

  local _
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  smoke_warn "forcing ${name} (pid=${pid}) to stop"
  kill -9 "$target_pid" >/dev/null 2>&1 || true
}

assert_pid_running() {
  local pid="$1"
  local name="$2"

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    smoke_error "${name} is not running (pid=${pid})"
    return 1
  fi
}

print_log_tail() {
  local file="$1"
  local lines="${2:-120}"

  if [ -f "$file" ]; then
    echo "--- tail ${file}"
    tail -n "$lines" "$file"
  else
    echo "--- missing ${file}"
  fi
}

print_default_log_tails() {
  print_log_tail "${SMOKE_LOG_DIR}/web.log"
  print_log_tail "${SMOKE_LOG_DIR}/worker.log"
}

print_sql_snapshot() {
  local note_id="${1:-}"
  local note_version_id="${2:-}"

  if [ -z "${DATABASE_URL:-}" ]; then
    smoke_warn "DATABASE_URL is missing; skipping SQL snapshot"
    return 0
  fi

  DATABASE_URL="$DATABASE_URL" SNAP_NOTE_ID="$note_id" SNAP_NOTE_VERSION_ID="$note_version_id" node <<'NODE' || true
const { Client } = require("pg");

const noteId = process.env.SNAP_NOTE_ID || null;
const noteVersionId = process.env.SNAP_NOTE_VERSION_ID || null;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const queries = [
    {
      label: "mirror_jobs",
      sql: `select id, note_version_id, target, status, attempts, left(coalesce(last_error, ''), 120) as last_error, updated_at::text
            from mirror_jobs
            where ($1::uuid is null or note_version_id = $1::uuid)
            order by created_at desc
            limit 12`,
      params: [noteVersionId]
    },
    {
      label: "note_versions",
      sql: `select id, note_id, version, git_commit_sha, ipfs_cid, created_at::text
            from note_versions
            where ($1::uuid is null or id = $1::uuid)
               or ($2::uuid is null or note_id = $2::uuid)
            order by created_at desc
            limit 12`,
      params: [noteVersionId, noteId]
    },
    {
      label: "notes",
      sql: `select id, slug, title, current_version, created_at::text
            from notes
            where ($1::uuid is null or id = $1::uuid)
            order by created_at desc
            limit 12`,
      params: [noteId]
    }
  ];

  for (const query of queries) {
    const result = await client.query(query.sql, query.params);
    console.log(`--- sql snapshot: ${query.label}`);
    console.log(JSON.stringify(result.rows, null, 2));
  }

  await client.end();
}

run().catch((error) => {
  console.error("[smoke][warn] could not collect SQL snapshot", error);
  process.exit(1);
});
NODE
}

load_smoke_pids() {
  if [ -f "$SMOKE_PIDS_FILE" ]; then
    # shellcheck disable=SC1090
    source "$SMOKE_PIDS_FILE"
  fi
}
