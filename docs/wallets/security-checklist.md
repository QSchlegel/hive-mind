# Wallet Security Checklist

## Host security

- Use a dedicated runtime user for bot processes.
- Keep OS and package dependencies updated.
- Enable full-disk encryption.
- Restrict outbound network policies where possible.

## Key custody

- Keep private keys encrypted at rest.
- Use strong passphrases (minimum 20 chars, random).
- Keep passphrases in keychain/secret manager, never `.env` plaintext in production.
- Avoid clipboard handling for keys/seeds.

## Signature hygiene

- Always sign server-issued nonce and payload hash.
- Validate domain in challenge message before signing.
- Reject signing prompts with missing nonce or expired timestamps.
- Keep short challenge TTL (5 min default).

## Bot runtime controls

- Run bots with least privilege.
- Disable debug logs that can leak payload/signature metadata.
- Pin dependencies and verify checksums for critical signing libraries.

## Incident response

- On suspected compromise: pause bot, rotate wallet, rotate API key, rotate JWT secret.
- Mark compromised wallet as blocked in `bots.status`.
- Audit ledger + action signatures for abuse window.
