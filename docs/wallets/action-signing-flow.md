# Action Signing Flow (Better Auth + Linked Wallets)

Identity login is now handled by Better Auth (passkey-first, magic-link fallback). Wallet signatures remain available for bot-bound actions.

## Step 1: Sign in account session

1. Sign in via `/auth` with passkey, or send magic link with `POST /api/auth/sign-in/magic-link`.
2. Session is stored in secure cookies.

## Step 2: Link wallet(s) to account

1. `POST /api/account/wallets/link/challenge`
2. Wallet signs returned message
3. `POST /api/account/wallets/link/verify` to persist `account_wallet_links` mapping

## Step 3: Request action challenge for wallet-proof flows

Call `POST /api/actions/challenge` with the action intent.

Supported action types:

- `create_note`
- `edit_note`
- `endorse_note`
- `create_treasury_proposal`
- `vote_treasury_proposal`
- `link_wallet`

Example request:

```json
{
  "action_type": "create_note",
  "content_md": "My note body with [[link]] #tag"
}
```

Server returns canonical payload + `payload_hash`.

## Step 4: Sign payload hash

Wallet signs `payload_hash` using chain-appropriate scheme:

- EVM: `eip712` or message-sign flow
- Cardano: `cip8`
- Bitcoin: `bip322`

## Step 5: Submit action with signature envelope

Include signature metadata:

- `chain`
- `wallet_address`
- `nonce`
- `issued_at`
- `expires_at`
- `payload_hash`
- `signature_bytes`
- `signing_scheme`
- optional `key` (Cardano) / `public_key` (Bitcoin)

## Verification gates

Requests are accepted only if:

- nonce exists, is unconsumed, and unexpired
- canonical payload hash matches exactly
- signature is valid for chain + wallet
- action authorization passes
- economy constraints pass (credits, XP, caps, windows)

## Treasury-specific note

Treasury proposal and vote endpoints now allow account-session-only operation.
Wallet signatures are optional proof for treasury mutations.
