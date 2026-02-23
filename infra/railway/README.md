# Railway Deployment Guide

This project is designed for a single Railway project with two environments:

- `staging`
- `production`

## 1. Bootstrap

```bash
railway login
railway init
railway environment new staging
railway environment new production
```

## 2. Add Services

Create one service per runtime component:

- web
- worker
- sb-db
- sb-kong
- sb-auth
- sb-rest
- sb-realtime
- sb-studio
- ipfs
- otel-collector
- tempo
- loki
- mimir
- grafana

Example:

```bash
railway add --service web
railway add --service worker
railway add --service sb-db
```

## 3. Volumes

Attach persistent volumes to:

- sb-db
- ipfs
- loki
- mimir
- grafana

```bash
railway volume add --service sb-db
```

## 4. Variables

Set shared env vars on `web` and `worker`:

- `DATABASE_URL`
- `APP_JWT_SECRET`
- `APP_DOMAIN`
- `CHAIN_EVM_ENABLED`
- `CHAIN_CARDANO_ENABLED`
- `CHAIN_BITCOIN_ENABLED`
- `BITCOIN_NETWORK`
- `IPFS_API_URL`
- `VAULT_MIRROR_REPO_URL`
- `OTEL_EXPORTER_OTLP_ENDPOINT`

Set Stripe vars on `web`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## 5. Deploy

Use GitHub-connected deploys with service root mapping:

- web -> `apps/web`
- worker -> `apps/worker`
- supabase and observability services -> `infra/*` Docker contexts

## 6. Domains

- production `web` service: `hive-mind.club`, `www.hive-mind.club`
- staging `web` service: `staging.hive-mind.club`
- keep `sb-studio` and `grafana` private/internal
