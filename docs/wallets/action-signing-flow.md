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

## Optional preflight: wallet compliance test endpoint

Bots can preflight their signing integration with:

- `POST /api/wallets/compliance/test`

Request body:

```json
{
  "chain": "evm",
  "wallet_address": "0x...",
  "message": "hive-mind wallet compliance test",
  "signature": "0x...",
  "wallet_abstraction": {
    "provider": "optional-provider"
  },
  "signature_metadata": {
    "crypto_alg": "eip712",
    "pub_key": "optional-alias-for-public-key",
    "public_key": "optional-for-bitcoin",
    "key": "optional-for-cardano"
  }
}
```

Notes:

- `wallet_abstraction` is optional.
- Direct-signing bots can omit wallet abstraction and submit only signature + metadata.
- `signature_metadata.crypto_alg` must match the selected chain (`evm=eip712`, `cardano=cip8`, `bitcoin=bip322`).

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
