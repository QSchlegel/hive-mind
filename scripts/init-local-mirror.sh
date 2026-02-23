#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .local
MIRROR_PATH="${1:-$ROOT_DIR/.local/vault-mirror.git}"

if [ ! -d "$MIRROR_PATH" ]; then
  git init --bare "$MIRROR_PATH"
  echo "[mirror] created bare mirror at $MIRROR_PATH"
else
  echo "[mirror] mirror already exists at $MIRROR_PATH"
fi
