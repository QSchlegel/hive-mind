#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

required_commands=(node npm docker)
optional_commands=(supabase stripe railway psql git)
missing=()

for cmd in "${required_commands[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    missing+=("$cmd")
  fi
done

echo "[bootstrap] node: $(node -v 2>/dev/null || echo missing)"
echo "[bootstrap] npm: $(npm -v 2>/dev/null || echo missing)"
echo "[bootstrap] docker: $(docker --version 2>/dev/null || echo missing)"
for cmd in "${optional_commands[@]}"; do
  case "$cmd" in
    stripe)
      echo "[bootstrap] stripe (optional): $(stripe version 2>/dev/null || echo missing)"
      ;;
    *)
      echo "[bootstrap] ${cmd} (optional): $($cmd --version 2>/dev/null || echo missing)"
      ;;
  esac
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "[bootstrap] missing required commands: ${missing[*]}"
  echo "Install suggestions (macOS):"
  echo "  brew install node"
  echo "  brew install supabase/tap/supabase"
  echo "  brew install stripe/stripe-cli/stripe"
  echo "  brew install railway"
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "[bootstrap] node >= 22 is required (found $(node -v))."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[bootstrap] docker daemon is not reachable."
  echo "Start Docker Desktop (or your Docker engine) and retry."
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "[bootstrap] note: supabase CLI missing, docker-compose fallback will be used"
fi

if ! command -v stripe >/dev/null 2>&1; then
  echo "[bootstrap] note: stripe CLI missing, webhook listener will be skipped"
fi

mkdir -p .local

if [ ! -f .env ]; then
  cp .env.shared.example .env
  echo "[bootstrap] wrote .env from .env.shared.example"
fi

if [ ! -f infra/supabase/.env ]; then
  cp infra/supabase/.env.example infra/supabase/.env
  echo "[bootstrap] wrote infra/supabase/.env from template"
fi

if [ ! -d node_modules ]; then
  npm install
fi

echo "[bootstrap] done"
