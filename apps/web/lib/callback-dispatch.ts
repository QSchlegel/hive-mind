import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { NoteCallbackEvent, NoteCallbackPayload } from "@hive-mind/shared";
import { getEnv } from "./env";

const ENCRYPTION_VERSION = "v1";
const DEV_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function encryptionKeyMaterial(): string {
  const env = getEnv();
  return env.CALLBACK_SECRET_ENCRYPTION_KEY || env.APP_JWT_SECRET;
}

function deriveAesKey(): Buffer {
  return createHash("sha256").update(encryptionKeyMaterial()).digest();
}

export function generateCallbackSecret(): string {
  return randomBytes(32).toString("hex");
}

export function encryptCallbackSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveAesKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptCallbackSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid callback secret payload");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveAesKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function validateCallbackEndpointUrl(
  endpointUrl: string,
  nodeEnv: "development" | "test" | "production" = getEnv().NODE_ENV
): { ok: true } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return { ok: false, reason: "endpoint_url must be a valid URL" };
  }

  if (parsed.protocol === "https:") {
    return { ok: true };
  }

  if (parsed.protocol !== "http:") {
    return { ok: false, reason: "endpoint_url must use https" };
  }

  if (nodeEnv !== "production" && DEV_HTTP_HOSTS.has(parsed.hostname)) {
    return { ok: true };
  }

  return { ok: false, reason: "endpoint_url must use https (localhost http allowed in development/test)" };
}

function callbackSignature(secret: string, timestamp: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${digest}`;
}

export interface DispatchCallbackInput {
  endpointUrl: string;
  deliveryId: string;
  attempt: number;
  event: NoteCallbackEvent;
  payload: NoteCallbackPayload;
  signingSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface DispatchCallbackResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export async function dispatchCallbackRequest(input: DispatchCallbackInput): Promise<DispatchCallbackResult> {
  const env = getEnv();
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? env.CALLBACK_REQUEST_TIMEOUT_MS;
  const timestamp = new Date().toISOString();
  const rawBody = JSON.stringify(input.payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(input.endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hive-mind-event": input.event,
        "x-hive-mind-delivery-id": input.deliveryId,
        "x-hive-mind-attempt": String(input.attempt),
        "x-hive-mind-timestamp": timestamp,
        "x-hive-mind-signature": callbackSignature(input.signingSecret, timestamp, rawBody)
      },
      body: rawBody,
      signal: controller.signal
    });

    if (response.ok) {
      return { ok: true, status: response.status, error: null };
    }

    const bodyText = await response.text().catch(() => "");
    const suffix = bodyText ? `: ${bodyText.slice(0, 300)}` : "";
    return {
      ok: false,
      status: response.status,
      error: `Callback endpoint responded with ${response.status}${suffix}`
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Unknown callback delivery failure"
    };
  } finally {
    clearTimeout(timeout);
  }
}
