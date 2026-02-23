# Local RYO Runbook

## Prerequisites

Required:

- Node 22+
- npm 11+
- Docker

Optional (used by full local stack / deploy workflows):

- Supabase CLI
- Stripe CLI
- Railway CLI
- `psql` CLI

## Bootstrap

```bash
npm run setup:local
```

This validates required tooling and creates `.env` from `.env.shared.example` if missing.

For passkey + magic-link auth flows, ensure these are set in `.env`:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_FROM`
- optional: `SMTP_USER`, `SMTP_PASS`
- optional treasury admin gates: `TREASURY_ADMIN_EMAIL_ALLOWLIST`, `TREASURY_ADMIN_WALLET_ALLOWLIST`

## Deterministic end-to-end smoke (recommended)

```bash
npm run smoke:e2e:local
```

This flow starts a slim smoke stack (`postgres` + `ipfs`), runs migrations/seed, launches web + worker, validates mirror side effects, and tears down automatically.

## Debug toggles

Keep stack running after smoke failure/success:

```bash
KEEP_SMOKE_STACK_UP=1 npm run smoke:e2e:local
```

Increase smoke timeout (default is 120s):

```bash
SMOKE_TIMEOUT_SECONDS=300 npm run smoke:e2e:local
```

Run smoke against externally provided infra (CI-style):

```bash
SMOKE_INFRA_MODE=ci npm run ci:smoke
```

## Manual smoke orchestration

Bring up stack, run smoke scenario only, then stop:

```bash
npm run smoke:stack:up
npm run smoke:e2e
npm run smoke:stack:down
```

## Full local development stack

```bash
npm run dev:up
npm run smoke:local
npm run smoke:signing
npm run dev:down
```

Then open:

- `http://127.0.0.1:3000/auth` for passkey/magic-link auth
- `http://127.0.0.1:3000/treasury` for public treasury status
- `http://127.0.0.1:3000/treasury/account` for member proposal/vote/funding flow
- `http://127.0.0.1:3000/treasury/admin` for payout operations (allowlisted admins)

## CI parity checks

```bash
npm run ci:quality
npm run ci:smoke
```

GitHub Actions runs the same checks via `/Users/quirinschlegel/git/hive-mind/.github/workflows/ci.yml` jobs `ecosystem-quality` and `smoke-e2e`.
