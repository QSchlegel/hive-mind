import { readEnv, type AppEnv } from "@hive-mind/config";

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }
  cachedEnv = readEnv(process.env);
  return cachedEnv;
}
