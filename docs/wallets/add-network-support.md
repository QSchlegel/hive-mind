# Add Support for a New Network

This codebase currently supports `evm`, `cardano`, and `bitcoin`.
To add another network, follow this checklist so auth, signing, storage, and UI stay in sync.

## 1. Choose canonical identifiers

- Pick a lowercase chain id (example: `solana`).
- Pick a signing scheme id (example: `ed25519_detached`).
- Reuse these exact ids across TypeScript types, Zod schemas, DB constraints, and API payloads.

## 2. Extend shared types and schemas

Update shared contracts first:

- `packages/shared/src/types.ts`
- `packages/shared/src/signatures.ts`

Add the new chain to `WalletChain` and all `z.enum([...])` validations.
If needed, add a new signing scheme to `SigningScheme` and envelope schema.

## 3. Update API/session/nonces validation

These files also hardcode supported chains:

- `apps/web/app/api/auth/challenge/route.ts`
- `apps/web/app/api/auth/verify/route.ts`
- `apps/web/app/api/waitlist/route.ts`
- `apps/web/lib/session.ts`
- `apps/web/lib/nonces.ts`

Add your new chain to each union/enum so requests, sessions, and nonce lookups accept it.

## 4. Implement verifier logic

Add chain-specific verification logic in:

- `apps/web/lib/signature-verifier.ts`

Required updates:

- `isChainEnabled()` toggle mapping
- `normalizeAddress()` rules for your address format
- `verifyActionSignature()` branch
- `verifyAuthSignature()` branch

If your chain needs a new SDK, add it to `apps/web/package.json`.

## 5. Add config toggles and environment docs

Add a new env flag in:

- `packages/config/src/index.ts`

Then document/example it in:

- `.env.shared.example`
- `.env.web.example`
- `.env.worker.example`
- `infra/railway/variables.example.env`
- `infra/railway/README.md`
- `docs/runbooks/railway-deploy.md`

Pattern to follow: `CHAIN_<NETWORK>_ENABLED`.

## 6. Add a database migration (do not patch historical init in-place)

Create a new migration under `infra/supabase/migrations/` that updates check constraints for:

- `bots.wallet_chain`
- `waitlist_entries.wallet_chain`
- `action_nonces.chain`
- `action_signatures.chain`
- `action_signatures.signing_scheme` (if adding a new scheme)

Use an additive migration so existing environments can be upgraded safely.

## 7. Update UI and docs

If users can pick the chain, update:

- `apps/web/components/waitlist-form.tsx`

Also update any docs that list supported chains (for example signing flow docs).

## 8. Add tests and run smoke checks

At minimum, test:

- valid signature path for the new network
- invalid signature rejection
- wallet mismatch rejection
- disabled-chain rejection via env flag

Then run:

```bash
npm run smoke:signing
npm test
```

## Quick contributor checklist

- [ ] Shared types/schemas updated
- [ ] API/session/nonces updated
- [ ] Verifier branches implemented
- [ ] Config/env toggles added
- [ ] DB migration added
- [ ] UI/docs updated
- [ ] Smoke + tests pass
