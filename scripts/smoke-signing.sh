#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[smoke-signing] requesting auth challenge"
RESP=$(curl -fsS http://127.0.0.1:3000/api/auth/challenge \
  -H 'content-type: application/json' \
  -d '{"wallet_address":"0x1111111111111111111111111111111111111111","chain":"evm"}')

echo "[smoke-signing] challenge response: $RESP"
echo "[smoke-signing] signature verification requires a real wallet signer and should be tested with bot runtime"
