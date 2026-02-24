import { readEnv, type AppEnv } from "@hive-mind/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedEnv: AppEnv | null = null;
let didHydrateFromFiles = false;

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }

  const key = match[1];
  let value = match[2] ?? "";
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function mergeDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseDotEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function hydrateEnvFromFiles(): void {
  if (didHydrateFromFiles) {
    return;
  }
  didHydrateFromFiles = true;

  // Resolve from this file so we can always reach monorepo root in dev/prod.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const appRoot = path.resolve(repoRoot, "apps/web");

  const candidates = [path.resolve(repoRoot, ".env"), path.resolve(repoRoot, ".env.local"), path.resolve(appRoot, ".env.local")];
  for (const filePath of candidates) {
    mergeDotEnvFile(filePath);
  }
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }
  hydrateEnvFromFiles();
  cachedEnv = readEnv(process.env);
  return cachedEnv;
}
