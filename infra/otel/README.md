# OpenTelemetry Stack

Local compose stack for observability:

- OTel Collector (OTLP ingest)
- Tempo (traces)
- Loki (logs)
- Mimir (metrics)
- Grafana (dashboards)

## Run

```bash
docker compose -f infra/otel/docker-compose.yml up -d
```

## Endpoints

- OTLP HTTP: `http://127.0.0.1:4318`
- Grafana: `http://127.0.0.1:3001` (`admin`/`admin`)
