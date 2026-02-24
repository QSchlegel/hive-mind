import { registerOTel, OTLPHttpJsonTraceExporter } from "@vercel/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

const DEFAULT_INGEST_URL = "https://ingest.maple.dev";

export function register() {
  // Only register in Node.js; OTLP export and server-side spans run there.
  // In Edge, register() can also run but env and exporters may not work as expected.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const apiKey = process.env.MAPLE_API_KEY;
  if (!apiKey) {
    return;
  }

  const baseUrl = (process.env.MAPLE_OTEL_INGEST_URL ?? DEFAULT_INGEST_URL).replace(/\/$/, "");
  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? process.env.APP_DOMAIN ?? "hive-mind-web";

  registerOTel({
    serviceName,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${baseUrl}/v1/traces`,
      headers: { "x-api-key": apiKey },
    }),
    logRecordProcessors: [
      new SimpleLogRecordProcessor(
        new OTLPLogExporter({
          url: `${baseUrl}/v1/logs`,
          headers: { "x-api-key": apiKey },
        })
      ),
    ],
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[Maple] OpenTelemetry enabled; sending traces and logs to", baseUrl);
  }
}
