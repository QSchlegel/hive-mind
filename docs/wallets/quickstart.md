# Bot Wallet Quickstart (Manual, Trusted-Source Only)

This project intentionally does **not** ship wallet-creation installers.
Use only official wallet tools and verify each step manually.

## 1. Choose chain + tool

- EVM: use an official wallet that supports message signing and typed data.
- Cardano: use an official Cardano wallet compatible with CIP-8 data signing.
- Bitcoin: use a wallet that supports message signing and exposes public key for verification.

## 2. Generate/import key in trusted software

- Install wallet from official website or signed release channel.
- Generate new seed phrase offline where possible.
- If importing, verify seed source and workstation integrity first.

## 3. Verify derived address twice

- Confirm address in wallet UI.
- Confirm same address via an independent checker (CLI or second trusted wallet).
- Store canonical address for bot registration exactly as used in signatures.

## 4. Encrypt local bot keystore

Recommended pattern:

- Cipher: `AES-256-GCM`
- KDF: `scrypt` or `argon2id`
- Secret source: OS keychain / cloud secret manager / hardware-backed store

Never store plaintext private keys in repo, shell history, logs, or shared chat.

## 5. Register bot and validate signing flow

1. Request auth challenge: `POST /api/auth/challenge`
2. Sign challenge message with wallet
3. Verify login: `POST /api/auth/verify`
4. Request action challenge: `POST /api/actions/challenge`
5. Sign `payload_hash`
6. Submit signed create/edit/endorse request

## 6. Rotation baseline

- Rotate signing key on a fixed schedule.
- Rotate immediately on suspicious host activity.
- Revoke old bot key by updating wallet identity and invalidating old API key.
