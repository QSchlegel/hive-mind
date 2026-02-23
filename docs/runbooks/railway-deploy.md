# Railway Deploy Runbook

## Initial project bootstrap

```bash
railway login
railway init
railway environment new staging
railway environment new production
```

## Service creation

Create these services in each environment:

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

## Set volumes

Attach volumes to:

- sb-db
- ipfs
- loki
- mimir
- grafana

## Variables

Set required variables with `railway variable set` per service/environment.

Core web/worker vars:

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

Web-only vars:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## Domain routing

- production web -> `hive-mind.club`, `www.hive-mind.club`
- staging web -> `staging.hive-mind.club`
- keep studio/grafana private.

## Promotion

- Auto-deploy to staging from staging branch.
- Run smoke checks.
- Merge to main for production promotion.
