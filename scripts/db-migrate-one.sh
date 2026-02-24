#!/usr/bin/env bash
# Run a single migration file by name (e.g. 0006 or 0006_account_wallet_links_display_label.sql)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${1:-}" ]; then
  echo "Usage: npm run db:migrate-one -- <name>" >&2
  echo "Example: npm run db:migrate-one -- 0006" >&2
  exit 1
fi

NAME="$1"
# Allow 0006 or 0006_account_wallet_links_display_label.sql
FILE="infra/supabase/migrations/${NAME}.sql"
if [ ! -f "$FILE" ]; then
  FILE="infra/supabase/migrations/${NAME}"
  if [ ! -f "$FILE" ]; then
    # Try prefix match
    FILE=$(ls infra/supabase/migrations/"${NAME}"*.sql 2>/dev/null | head -1)
  fi
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "No migration found for: $NAME" >&2
  exit 1
fi

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DB_COMPOSE_FILE="${DB_COMPOSE_FILE:-infra/supabase/docker-compose.core.yml}"
DB_COMPOSE_ENV_FILE="${DB_COMPOSE_ENV_FILE:-infra/supabase/.env}"
DB_CONTAINER="${DB_CONTAINER:-sb-db}"
COMPOSE_ARGS=(-f "$DB_COMPOSE_FILE")
if [ -n "$DB_COMPOSE_ENV_FILE" ] && [ -f "$DB_COMPOSE_ENV_FILE" ]; then
  COMPOSE_ARGS+=(--env-file "$DB_COMPOSE_ENV_FILE")
fi

run_sql_file() {
  local file="$1"
  if command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"
    return
  fi
  if command -v docker >/dev/null 2>&1 && [ -f "$DB_COMPOSE_FILE" ]; then
    if docker compose "${COMPOSE_ARGS[@]}" ps "$DB_CONTAINER" >/dev/null 2>&1; then
      docker compose "${COMPOSE_ARGS[@]}" exec -T "$DB_CONTAINER" \
        psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
      return
    fi
  fi
  echo "Install psql or start DB with docker compose, or set DATABASE_URL" >&2
  exit 1
}

echo "[db:migrate-one] applying $FILE"
run_sql_file "$FILE"
echo "[db:migrate-one] done"
