# Service Mapping

| Service | Source | Start Command | Health Check |
|---|---|---|---|
| web | `apps/web` | `npm run start --workspace @hive-mind/web` | `GET /api/graph` |
| worker | `apps/worker` | `npm run start --workspace @hive-mind/worker` | process alive |
| sb-db | docker image | postgres default | tcp 5432 |
| sb-kong | `infra/supabase/docker-compose.core.yml` | kong | `GET /` |
| sb-auth | docker image | gotrue | tcp 9999 |
| sb-rest | docker image | postgrest | tcp 3000 |
| sb-realtime | docker image | realtime | tcp 4000 |
| sb-studio | docker image | studio | tcp 3000 |
| ipfs | `ipfs/kubo` | daemon | tcp 5001 |
| otel-collector | `infra/otel/collector.yaml` | otelcol | tcp 4318 |
| tempo | `infra/otel/tempo.yaml` | tempo | tcp 3200 |
| loki | `infra/otel/loki.yaml` | loki | tcp 3100 |
| mimir | `infra/otel/mimir.yaml` | mimir | tcp 9009 |
| grafana | grafana image | grafana | tcp 3000 |
