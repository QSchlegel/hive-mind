import { z } from "zod";

const boolFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return false;
}, z.boolean());

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  PUBLIC_SUPABASE_URL: z.string().url().optional(),
  PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  APP_JWT_SECRET: z.string().min(32),
  APP_DOMAIN: z.string().default("hive-mind.club"),
  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  TREASURY_ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
  TREASURY_ADMIN_WALLET_ALLOWLIST: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_CREDIT_TOPUP: z.string().optional(),
  TREASURY_VOTE_QUORUM_XP: z.coerce.number().int().positive().default(1000),
  TREASURY_DEFAULT_VOTING_WINDOW_HOURS: z.coerce.number().int().positive().max(720).default(168),
  CHAIN_EVM_ENABLED: boolFromEnv.default(true),
  CHAIN_CARDANO_ENABLED: boolFromEnv.default(true),
  CHAIN_BITCOIN_ENABLED: boolFromEnv.default(true),
  IPFS_API_URL: z.string().url().optional(),
  VAULT_MIRROR_REPO_URL: z.string().optional(),
  VAULT_MIRROR_WORKDIR: z.string().default(".local/vault-mirror"),
  BITCOIN_NETWORK: z.enum(["mainnet", "testnet", "regtest"]).default("mainnet"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
  CALLBACK_SECRET_ENCRYPTION_KEY: z.string().optional(),
  CALLBACK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(2500),
  GIT_AUTHOR_NAME: z.string().default("Hive Mind Worker"),
  GIT_AUTHOR_EMAIL: z.string().email().default("worker@hive-mind.club"),
  RAILWAY_ENVIRONMENT: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  MAPLE_OTEL_INGEST_URL: z.string().url().optional(),
  MAPLE_API_KEY: z.string().optional()
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function readEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return appEnvSchema.parse(env);
}
