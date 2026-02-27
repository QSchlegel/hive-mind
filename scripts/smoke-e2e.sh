#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/smoke-common.sh"

load_env_file "$ROOT_DIR/.env"

export SMOKE_DATABASE_URL="${SMOKE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
export SMOKE_IPFS_API_URL="${SMOKE_IPFS_API_URL:-http://127.0.0.1:5001/api/v0}"
export DATABASE_URL="$SMOKE_DATABASE_URL"
export IPFS_API_URL="$SMOKE_IPFS_API_URL"
export VAULT_MIRROR_REPO_URL="${VAULT_MIRROR_REPO_URL:-$ROOT_DIR/.local/vault-mirror.git}"

require_cmd node
require_cmd curl
require_cmd git

NOTE_ID=""
NOTE_VERSION_ID=""
NOTE_SLUG=""
NOTE_GIT_COMMIT_SHA=""
NOTE_IPFS_CID=""
TREASURY_BOT_ID=""
TREASURY_SESSION_COOKIE=""
TREASURY_PROPOSAL_ID=""

on_error() {
  local code="$?"
  set +e
  smoke_error "e2e smoke failed"
  print_sql_snapshot "$NOTE_ID" "$NOTE_VERSION_ID"
  print_default_log_tails
  exit "$code"
}
trap on_error ERR

smoke_log "checking base HTTP health"
wait_for_http "http://127.0.0.1:3000" "$SMOKE_TIMEOUT_SECONDS"
wait_for_http "http://127.0.0.1:3000/api/graph" "$SMOKE_TIMEOUT_SECONDS"

smoke_log "seeding deterministic mirror job scenario"
INSERT_VARS=$(DATABASE_URL="$DATABASE_URL" node <<'NODE'
const crypto = require("node:crypto");
const { Client } = require("pg");

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const botId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  const noteVersionId = crypto.randomUUID();
  const slug = `smoke-note-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const title = "Smoke E2E Note";
  const content = "Smoke test mirror payload with [[wallet-signing]] #smoke";
  const wallet = `0x${crypto.randomBytes(20).toString("hex")}`;
  const changed = content.length;

  await client.query(
    `insert into bots (id, wallet_chain, wallet_address, status, xp_balance, credit_balance_micro_eur)
     values ($1, 'evm', $2, 'active', 5000, 500000)`,
    [botId, wallet]
  );

  await client.query(
    `insert into notes (
      id,
      slug,
      author_bot_id,
      title,
      current_content_md,
      current_char_count,
      current_version,
      visibility,
      moderation_status
    ) values ($1,$2,$3,$4,$5,$6,1,'public','approved')`,
    [noteId, slug, botId, title, content, changed]
  );

  await client.query(
    `insert into note_versions (
      id,
      note_id,
      version,
      author_bot_id,
      content_md,
      changed_chars,
      xp_minted,
      cost_micro_eur,
      moderation_status
    ) values ($1,$2,1,$3,$4,$5,$6,$7,'approved')`,
    [noteVersionId, noteId, botId, content, changed, changed, changed]
  );

  await client.query(
    `insert into mirror_jobs (note_version_id, target, status)
     values ($1, 'git', 'queued'), ($1, 'ipfs', 'queued')`,
    [noteVersionId]
  );

  await client.end();

  console.log(`NOTE_ID=${noteId}`);
  console.log(`NOTE_VERSION_ID=${noteVersionId}`);
  console.log(`NOTE_SLUG=${slug}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)

while IFS='=' read -r key value; do
  case "$key" in
    NOTE_ID) NOTE_ID="$value" ;;
    NOTE_VERSION_ID) NOTE_VERSION_ID="$value" ;;
    NOTE_SLUG) NOTE_SLUG="$value" ;;
  esac
done <<< "$INSERT_VARS"

if [ -z "$NOTE_ID" ] || [ -z "$NOTE_VERSION_ID" ] || [ -z "$NOTE_SLUG" ]; then
  smoke_error "could not parse seeded scenario identifiers"
  exit 1
fi

smoke_log "waiting for worker to complete git + ipfs mirror jobs"
MIRROR_VARS=$(DATABASE_URL="$DATABASE_URL" NOTE_VERSION_ID="$NOTE_VERSION_ID" WAIT_TIMEOUT_SECONDS="$SMOKE_TIMEOUT_SECONDS" node <<'NODE'
const { Client } = require("pg");

const timeoutSeconds = Number(process.env.WAIT_TIMEOUT_SECONDS || "120");
const deadline = Date.now() + timeoutSeconds * 1000;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const noteVersionId = process.env.NOTE_VERSION_ID;
  let lastRows = [];

  while (Date.now() < deadline) {
    const jobs = await client.query(
      `select target, status, attempts, coalesce(last_error, '') as last_error
       from mirror_jobs
       where note_version_id = $1
       order by target asc`,
      [noteVersionId]
    );

    const version = await client.query(
      `select git_commit_sha, ipfs_cid
       from note_versions
       where id = $1`,
      [noteVersionId]
    );

    lastRows = jobs.rows;
    const byTarget = new Map(jobs.rows.map((row) => [row.target, row]));
    const git = byTarget.get("git");
    const ipfs = byTarget.get("ipfs");

    const allCompleted = git?.status === "completed" && ipfs?.status === "completed";
    const gitCommit = version.rows[0]?.git_commit_sha || "";
    const ipfsCid = version.rows[0]?.ipfs_cid || "";

    const anyDeadLetter = jobs.rows.some((row) => row.status === "dead_letter");
    if (anyDeadLetter) {
      console.error("mirror job entered dead_letter state", JSON.stringify(jobs.rows, null, 2));
      process.exit(1);
    }

    if (allCompleted && gitCommit && ipfsCid) {
      await client.end();
      console.log(`NOTE_GIT_COMMIT_SHA=${gitCommit}`);
      console.log(`NOTE_IPFS_CID=${ipfsCid}`);
      return;
    }

    await sleep(1500);
  }

  console.error("timed out waiting for mirror jobs", JSON.stringify(lastRows, null, 2));
  await client.end();
  process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)

while IFS='=' read -r key value; do
  case "$key" in
    NOTE_GIT_COMMIT_SHA) NOTE_GIT_COMMIT_SHA="$value" ;;
    NOTE_IPFS_CID) NOTE_IPFS_CID="$value" ;;
  esac
done <<< "$MIRROR_VARS"

if [ -z "$NOTE_GIT_COMMIT_SHA" ] || [ -z "$NOTE_IPFS_CID" ]; then
  smoke_error "mirror results missing git commit or ipfs cid"
  exit 1
fi

smoke_log "verifying git mirror commit exists"
if [ -d "$VAULT_MIRROR_REPO_URL" ]; then
  git --git-dir "$VAULT_MIRROR_REPO_URL" cat-file -e "${NOTE_GIT_COMMIT_SHA}^{commit}"
else
  git ls-remote "$VAULT_MIRROR_REPO_URL" | grep -F "$NOTE_GIT_COMMIT_SHA" >/dev/null
fi

smoke_log "verifying ipfs payload"
IPFS_API_URL="$IPFS_API_URL" NOTE_IPFS_CID="$NOTE_IPFS_CID" EXPECTED_NOTE_SLUG="$NOTE_SLUG" node <<'NODE'
async function run() {
  const url = `${process.env.IPFS_API_URL}/cat?arg=${encodeURIComponent(process.env.NOTE_IPFS_CID)}`;
  const timeoutMs = 60 * 1000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { method: "POST", signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`ipfs cat failed: ${response.status}`);
  }

  const body = await response.text();
  if (!body) {
    throw new Error("ipfs cat returned empty payload");
  }

  const payload = JSON.parse(body);
  if (payload.slug !== process.env.EXPECTED_NOTE_SLUG) {
    throw new Error(`unexpected slug in ipfs payload: ${payload.slug}`);
  }
  if (typeof payload.title !== "string" || payload.title.length === 0) {
    throw new Error("missing ipfs title");
  }
  if (typeof payload.content_md !== "string" || payload.content_md.length === 0) {
    throw new Error("missing ipfs content_md");
  }
  if (!Number.isInteger(payload.version) || payload.version < 1) {
    throw new Error("invalid ipfs version");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

smoke_log "verifying versions API reflects mirror metadata"
VERSIONS_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/notes/${NOTE_ID}/versions")
VERSIONS_JSON="$VERSIONS_JSON" EXPECTED_GIT_SHA="$NOTE_GIT_COMMIT_SHA" EXPECTED_IPFS_CID="$NOTE_IPFS_CID" node <<'NODE'
const body = JSON.parse(process.env.VERSIONS_JSON || "");
if (!body.ok) {
  throw new Error("versions endpoint returned ok=false");
}
if (!Array.isArray(body.versions) || body.versions.length === 0) {
  throw new Error("versions endpoint returned no versions");
}
const latest = body.versions[0];
if (latest.git_commit_sha !== process.env.EXPECTED_GIT_SHA) {
  throw new Error(`unexpected git_commit_sha: ${latest.git_commit_sha}`);
}
if (latest.ipfs_cid !== process.env.EXPECTED_IPFS_CID) {
  throw new Error(`unexpected ipfs_cid: ${latest.ipfs_cid}`);
}
NODE

smoke_log "verifying legacy wallet auth endpoints are deprecated"
AUTH_CHALLENGE_RESPONSE=$(curl -sS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/auth/challenge" \
  -H 'content-type: application/json' \
  -d '{"wallet_address":"0x1111111111111111111111111111111111111111","chain":"evm"}' \
  -w $'\n%{http_code}')
AUTH_CHALLENGE_STATUS="${AUTH_CHALLENGE_RESPONSE##*$'\n'}"
AUTH_CHALLENGE_BODY="${AUTH_CHALLENGE_RESPONSE%$'\n'*}"
if [ "$AUTH_CHALLENGE_STATUS" != "410" ]; then
  smoke_error "expected /api/auth/challenge to return 410, got $AUTH_CHALLENGE_STATUS"
  exit 1
fi

AUTH_VERIFY_RESPONSE=$(curl -sS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/auth/verify" \
  -H 'content-type: application/json' \
  -d '{"message":"deprecated","signature":"deprecated"}' \
  -w $'\n%{http_code}')
AUTH_VERIFY_STATUS="${AUTH_VERIFY_RESPONSE##*$'\n'}"
AUTH_VERIFY_BODY="${AUTH_VERIFY_RESPONSE%$'\n'*}"
if [ "$AUTH_VERIFY_STATUS" != "410" ]; then
  smoke_error "expected /api/auth/verify to return 410, got $AUTH_VERIFY_STATUS"
  exit 1
fi

AUTH_CHALLENGE_BODY="$AUTH_CHALLENGE_BODY" AUTH_VERIFY_BODY="$AUTH_VERIFY_BODY" node <<'NODE'
const challenge = JSON.parse(process.env.AUTH_CHALLENGE_BODY || "");
const verify = JSON.parse(process.env.AUTH_VERIFY_BODY || "");
const challengeError = String(challenge.error || "");
const verifyError = String(verify.error || "");
if (!challengeError.toLowerCase().includes("deprecated")) {
  throw new Error("challenge endpoint deprecation message missing");
}
if (!verifyError.toLowerCase().includes("deprecated")) {
  throw new Error("verify endpoint deprecation message missing");
}
if (!challengeError.includes("Better Auth") || !verifyError.includes("Better Auth")) {
  throw new Error("deprecation messages should reference Better Auth migration");
}
NODE

smoke_log "seeding account + linked bot for treasury account-session flow"
TREASURY_SEED_VARS=$(DATABASE_URL="$DATABASE_URL" BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-smoke-local-better-auth-secret}" node <<'NODE'
const crypto = require("node:crypto");
const { Client } = require("pg");
const { serializeSignedCookie } = require("better-call");

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const requestedUserId = `smoke-user-${crypto.randomUUID()}`;
  const sessionId = `smoke-session-${crypto.randomUUID()}`;
  const sessionToken = `smoke-token-${crypto.randomUUID()}`;
  const botId = crypto.randomUUID();
  const email = "smoke-admin@hive-mind.club";
  const walletAddress = `0x${crypto.randomBytes(20).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await client.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, $4, $4)
     on conflict (email) do update
       set name = excluded.name,
           "emailVerified" = excluded."emailVerified",
           "updatedAt" = excluded."updatedAt"
     returning id`,
    [requestedUserId, "Smoke Treasury Admin", email, now]
  );
  const userId = user.rows[0].id;

  await client.query(
    `insert into "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     values ($1, $2, $3, $4, $4, $5)`,
    [sessionId, expiresAt, sessionToken, now, userId]
  );

  await client.query(
    `insert into bots (id, wallet_chain, wallet_address, status, xp_balance, credit_balance_micro_eur)
     values ($1, 'evm', $2, 'active', 5000, 0)`,
    [botId, walletAddress]
  );

  await client.query(
    `insert into account_wallet_links (account_id, wallet_chain, wallet_address, bot_id)
     values ($1, 'evm', $2, $3)`,
    [userId, walletAddress, botId]
  );

  const treasuryAccount = await client.query(
    `select id
     from treasury_accounts
     where status = 'active'
     order by updated_at desc
     limit 1`
  );

  if (!treasuryAccount.rowCount) {
    throw new Error("No active treasury account found for smoke flow");
  }

  const signedCookie = await serializeSignedCookie("better-auth.session_token", sessionToken, process.env.BETTER_AUTH_SECRET, {
    path: "/",
    httpOnly: true,
    sameSite: "lax"
  });
  const sessionCookie = signedCookie.split(";")[0];

  console.log(`TREASURY_BOT_ID=${botId}`);
  console.log(`TREASURY_SESSION_COOKIE=${sessionCookie}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
)

while IFS='=' read -r key value; do
  case "$key" in
    TREASURY_BOT_ID) TREASURY_BOT_ID="$value" ;;
    TREASURY_SESSION_COOKIE) TREASURY_SESSION_COOKIE="$value" ;;
  esac
done <<< "$TREASURY_SEED_VARS"

if [ -z "$TREASURY_BOT_ID" ] || [ -z "$TREASURY_SESSION_COOKIE" ]; then
  smoke_error "could not parse treasury seed identifiers"
  exit 1
fi

smoke_log "creating treasury proposal with account session cookie"
TREASURY_CREATE_PAYLOAD=$(cat <<JSON
{
  "title": "Smoke Treasury Proposal",
  "summary": "Validates account-centric treasury proposal creation",
  "description_md": "Smoke flow proposal created through Better Auth account session and linked bot context.",
  "requested_amount_eur": 1.25,
  "voting_window_hours": 1,
  "source_bot_id": "$TREASURY_BOT_ID"
}
JSON
)

TREASURY_CREATE_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/treasury/proposals" \
  -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:3000' \
  -H "cookie: ${TREASURY_SESSION_COOKIE}" \
  -d "$TREASURY_CREATE_PAYLOAD")

TREASURY_PROPOSAL_ID=$(TREASURY_CREATE_JSON="$TREASURY_CREATE_JSON" node <<'NODE'
const body = JSON.parse(process.env.TREASURY_CREATE_JSON || "");
if (!body.ok || !body.proposal || typeof body.proposal.id !== "string") {
  throw new Error("treasury proposal creation failed");
}
console.log(body.proposal.id);
NODE
)

if [ -z "$TREASURY_PROPOSAL_ID" ]; then
  smoke_error "treasury proposal id missing after create"
  exit 1
fi

smoke_log "casting treasury vote using linked source_bot_id"
TREASURY_VOTE_PAYLOAD=$(cat <<JSON
{
  "vote": "yes",
  "xp_spent": 1200,
  "source_bot_id": "$TREASURY_BOT_ID"
}
JSON
)

TREASURY_VOTE_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/treasury/proposals/${TREASURY_PROPOSAL_ID}/vote" \
  -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:3000' \
  -H "cookie: ${TREASURY_SESSION_COOKIE}" \
  -d "$TREASURY_VOTE_PAYLOAD")

TREASURY_VOTE_JSON="$TREASURY_VOTE_JSON" node <<'NODE'
const body = JSON.parse(process.env.TREASURY_VOTE_JSON || "");
if (!body.ok || body.vote !== "yes") {
  throw new Error("treasury vote failed");
}
if (body.xp_spent !== 1200) {
  throw new Error(`unexpected xp_spent from vote response: ${body.xp_spent}`);
}
NODE

smoke_log "forcing proposal deadline to unlock finalize in smoke flow"
DATABASE_URL="$DATABASE_URL" TREASURY_PROPOSAL_ID="$TREASURY_PROPOSAL_ID" node <<'NODE'
const { Client } = require("pg");

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `update treasury_proposals
     set voting_deadline = now() - interval '5 minutes'
     where id = $1`,
    [process.env.TREASURY_PROPOSAL_ID]
  );
  await client.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

smoke_log "finalizing proposal to approved status"
TREASURY_FINALIZE_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/treasury/proposals/${TREASURY_PROPOSAL_ID}/finalize" \
  -X POST \
  -H 'origin: http://127.0.0.1:3000' \
  -H "cookie: ${TREASURY_SESSION_COOKIE}")

TREASURY_FINALIZE_JSON="$TREASURY_FINALIZE_JSON" node <<'NODE'
const body = JSON.parse(process.env.TREASURY_FINALIZE_JSON || "");
if (!body.ok || body.status !== "approved" || body.approved !== true) {
  throw new Error(`proposal finalize did not approve as expected: ${JSON.stringify(body)}`);
}
NODE

smoke_log "marking approved proposal as funded and recording payout metadata"
TREASURY_FUND_PAYLOAD=$(cat <<JSON
{
  "transfer_reference": "smoke-transfer-${TREASURY_PROPOSAL_ID}",
  "receipt_url": "https://example.com/receipts/${TREASURY_PROPOSAL_ID}",
  "notes": "Smoke treasury payout record"
}
JSON
)

TREASURY_FUND_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/treasury/proposals/${TREASURY_PROPOSAL_ID}/fund" \
  -X POST \
  -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:3000' \
  -H "cookie: ${TREASURY_SESSION_COOKIE}" \
  -d "$TREASURY_FUND_PAYLOAD")

TREASURY_FUND_JSON="$TREASURY_FUND_JSON" node <<'NODE'
const body = JSON.parse(process.env.TREASURY_FUND_JSON || "");
if (!body.ok || typeof body.payout_id !== "string") {
  throw new Error("treasury fund response missing payout_id");
}
if (!(typeof body.amount_micro_eur === "number" && body.amount_micro_eur > 0)) {
  throw new Error("treasury fund amount_micro_eur should be positive");
}
NODE

smoke_log "checking admin payout listing includes funded proposal"
TREASURY_PAYOUTS_JSON=$(curl -fsS --connect-timeout 5 --max-time 30 "http://127.0.0.1:3000/api/treasury/payouts" \
  -H "cookie: ${TREASURY_SESSION_COOKIE}")

TREASURY_PAYOUTS_JSON="$TREASURY_PAYOUTS_JSON" TREASURY_PROPOSAL_ID="$TREASURY_PROPOSAL_ID" node <<'NODE'
const body = JSON.parse(process.env.TREASURY_PAYOUTS_JSON || "");
if (!body.ok || !Array.isArray(body.payouts)) {
  throw new Error("treasury payouts endpoint returned invalid shape");
}
if (!body.payouts.some((row) => row.proposal_id === process.env.TREASURY_PROPOSAL_ID)) {
  throw new Error("funded proposal missing from payouts listing");
}
NODE

smoke_log "e2e smoke passed"
