#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DB_COMPOSE_FILE="${DB_COMPOSE_FILE:-infra/supabase/docker-compose.core.yml}"
DB_COMPOSE_ENV_FILE="${DB_COMPOSE_ENV_FILE:-infra/supabase/.env}"
DB_CONTAINER="${DB_CONTAINER:-sb-db}"

COMPOSE_ARGS=(-f "$DB_COMPOSE_FILE")
if [ -n "$DB_COMPOSE_ENV_FILE" ] && [ -f "$DB_COMPOSE_ENV_FILE" ]; then
  COMPOSE_ARGS+=(--env-file "$DB_COMPOSE_ENV_FILE")
fi

run_sql_file_with_node() {
  local file="$1"
  DATABASE_URL="$DB_URL" SQL_FILE="$file" node <<'NODE'
const fs = require("node:fs");
const { Client } = require("pg");

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync(process.env.SQL_FILE, "utf8");
  await client.query(sql);
  await client.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

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

  run_sql_file_with_node "$file"
}

for file in infra/supabase/migrations/*.sql; do
  echo "[db:migrate] applying $file"
  run_sql_file "$file"
done

echo "[db:migrate] complete"
