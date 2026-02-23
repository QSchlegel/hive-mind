# Treasury Governance (Account-Centric MVP)

Hive Mind treasury now runs on account sessions (Better Auth) with optional wallet-signed proofs:

- **Custody now**: Stripe-backed treasury account (`eur`).
- **Custody later**: switch active treasury account to `cross_chain` without replacing governance tables.
- **Governance identity**: one vote per **account** per proposal.
- **XP economics**: voting spends XP from a selected linked bot (`source_bot_id`).

## Data model

Core tables:

- `treasury_accounts`: active custody source (`stripe` or `cross_chain`) and treasury balance.
- `treasury_contributions`: Stripe/on-chain treasury funding records (now includes `contributor_account_id`).
- `treasury_proposals`: funding proposals with account proposer metadata (`proposer_account_id`).
- `treasury_votes`: XP-weighted votes with account voter identity (`voter_account_id`) and selected source bot.
- `treasury_payouts`: structured manual payout log (operator account, transfer reference, receipt URL, notes).

Identity bridge tables:

- `user`, `session`, `account`, `verification`, `passkey` (Better Auth).
- `account_wallet_links`: maps Better Auth account IDs to wallet/bot identities.

## API flow

1. **Fund treasury (Stripe)**
- `POST /api/treasury/create-checkout-session`
- Requires authenticated account session.
- Stripe webhook credits treasury balance and records contribution with `contributor_account_id` when available.

2. **Create proposal**
- `POST /api/treasury/proposals`
- Requires account session.
- Optional wallet-signature proof (`signature` + `source_bot_id`) is supported.

3. **Vote with XP**
- `POST /api/treasury/proposals/:id/vote`
- Requires account session and `source_bot_id` linked to that account.
- One vote per account per proposal.
- Spends selected bot XP and records `treasury_vote_spend` ledger entry.

4. **Finalize after deadline**
- `POST /api/treasury/proposals/:id/finalize`
- Admin-only operation.
- Marks proposal `approved` or `rejected` from quorum + majority.

5. **Record manual payout**
- `POST /api/treasury/proposals/:id/fund`
- Admin-only operation for approved proposals.
- Inserts `treasury_payouts` row and marks proposal `funded`.

6. **Observe treasury state**
- `GET /api/treasury`
- `GET /api/treasury/proposals`
- `GET /api/treasury/proposals/:id`
- `GET /api/treasury/payouts` (admin)

## Migration path to cross-chain treasury

When moving from Stripe custody to cross-chain custody:

1. Set active row in `treasury_accounts` to provider `cross_chain`.
2. Store on-chain treasury account references in `external_account_ref` and `network`.
3. Keep proposal + vote + payout tables unchanged.
4. Replace Stripe contribution ingestion with on-chain indexer events.
