import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { readEnv } from "@hive-mind/config";
import type { NoteCallbackEvent, NoteCallbackPayload } from "@hive-mind/shared";
import { query, withTransaction } from "./db";

type CallbackJob = {
  id: string;
  attempts: number;
  event_type: NoteCallbackEvent;
  payload_json: unknown;
  endpoint_url: string;
  enabled: boolean;
  signing_secret_encrypted: string;
};

const ENCRYPTION_VERSION = "v1";
const DEV_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function deriveAesKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function decryptCallbackSecret(encryptedPayload: string, keyMaterial: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = encryptedPayload.split(":");
  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid callback secret payload");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveAesKey(keyMaterial), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

function parsePayload(value: unknown): NoteCallbackPayload {
  if (typeof value === "string") {
    return JSON.parse(value) as NoteCallbackPayload;
  }
  return value as NoteCallbackPayload;
}

function callbackSignature(secret: string, timestamp: string, body: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `sha256=${digest}`;
}

function validateEndpointUrl(endpointUrl: string): { ok: true } | { ok: false; reason: string } {
  const env = readEnv(process.env);

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

  if (env.NODE_ENV !== "production" && DEV_HTTP_HOSTS.has(parsed.hostname)) {
    return { ok: true };
  }

  return { ok: false, reason: "endpoint_url must use https (localhost http allowed in development/test)" };
}

async function acquireCallbackJob(): Promise<CallbackJob | null> {
  return withTransaction(async (client) => {
    const locked = await client.query<CallbackJob>(
      `select j.id,
              j.attempts,
              j.event_type,
              j.payload_json,
              c.endpoint_url,
              c.enabled,
              c.signing_secret_encrypted
       from callback_postbox_jobs j
       join bot_note_callbacks c on c.id = j.bot_note_callback_id
       where j.status in ('queued', 'failed')
         and j.available_at <= now()
       order by j.created_at asc
       limit 1
       for update skip locked`
    );

    if (!locked.rowCount) {
      return null;
    }

    const job = locked.rows[0];

    await client.query(
      `update callback_postbox_jobs
       set status = 'processing',
           attempts = attempts + 1,
           updated_at = now()
       where id = $1`,
      [job.id]
    );

    return {
      ...job,
      attempts: job.attempts + 1
    };
  });
}

async function completeCallbackJob(jobId: string, httpStatus: number): Promise<void> {
  await query(
    `update callback_postbox_jobs
     set status = 'delivered',
         delivered_at = now(),
         last_http_status = $2,
         last_error = null,
         updated_at = now()
     where id = $1`,
    [jobId, httpStatus]
  );
}

async function failCallbackJob(
  job: CallbackJob,
  details: {
    message: string;
    httpStatus: number | null;
    forceDeadLetter?: boolean;
  }
): Promise<void> {
  const env = readEnv(process.env);
  const backoffSeconds = Math.min(120, 2 ** job.attempts);
  const nextStatus = details.forceDeadLetter || job.attempts >= env.WORKER_MAX_ATTEMPTS ? "dead_letter" : "failed";

  await query(
    `update callback_postbox_jobs
     set status = $2,
         last_http_status = $3,
         last_error = $4,
         available_at = case when $2 = 'failed' then now() + ($5 || ' seconds')::interval else available_at end,
         updated_at = now()
     where id = $1`,
    [job.id, nextStatus, details.httpStatus, details.message.slice(0, 8000), backoffSeconds]
  );
}

async function dispatchCallback(job: CallbackJob): Promise<{ ok: true; status: number } | { ok: false; status: number | null; error: string }> {
  const env = readEnv(process.env);
  const keyMaterial = env.CALLBACK_SECRET_ENCRYPTION_KEY || env.APP_JWT_SECRET;

  let secret: string;
  try {
    secret = decryptCallbackSecret(job.signing_secret_encrypted, keyMaterial);
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? `Could not decrypt callback secret: ${error.message}` : "Could not decrypt callback secret"
    };
  }

  let payload: NoteCallbackPayload;
  try {
    payload = parsePayload(job.payload_json);
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? `Invalid callback payload: ${error.message}` : "Invalid callback payload"
    };
  }

  const timestamp = new Date().toISOString();
  const rawBody = JSON.stringify(payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CALLBACK_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(job.endpoint_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hive-mind-event": job.event_type,
        "x-hive-mind-delivery-id": job.id,
        "x-hive-mind-attempt": String(job.attempts),
        "x-hive-mind-timestamp": timestamp,
        "x-hive-mind-signature": callbackSignature(secret, timestamp, rawBody)
      },
      body: rawBody,
      signal: controller.signal
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    const text = await response.text().catch(() => "");
    const suffix = text ? `: ${text.slice(0, 300)}` : "";

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

export async function processOneCallbackJob(): Promise<boolean> {
  const job = await acquireCallbackJob();
  if (!job) {
    return false;
  }

  if (!job.enabled) {
    await failCallbackJob(job, {
      message: "Callback disabled",
      httpStatus: null,
      forceDeadLetter: true
    });
    return true;
  }

  const endpointValidation = validateEndpointUrl(job.endpoint_url);
  if (!endpointValidation.ok) {
    await failCallbackJob(job, {
      message: endpointValidation.reason,
      httpStatus: null,
      forceDeadLetter: true
    });
    return true;
  }

  const dispatch = await dispatchCallback(job);
  if (dispatch.ok) {
    await completeCallbackJob(job.id, dispatch.status);
    console.log(`[worker] callback delivered job=${job.id} status=${dispatch.status}`);
    return true;
  }

  await failCallbackJob(job, {
    message: dispatch.error,
    httpStatus: dispatch.status,
    forceDeadLetter: dispatch.error.startsWith("Could not decrypt callback secret") || dispatch.error.startsWith("Invalid callback payload")
  });
  console.error(`[worker] callback failed job=${job.id}`, dispatch.error);
  return true;
}
