import type { PoolClient } from "pg";
import type { BotNoteCallbackConfig, CallbackPostboxStatus, NoteCallbackEvent, NoteCallbackPayload } from "@hive-mind/shared";
import { query, withTransaction } from "./db";
import { dispatchCallbackRequest, decryptCallbackSecret, encryptCallbackSecret, generateCallbackSecret, validateCallbackEndpointUrl } from "./callback-dispatch";
import { getEnv } from "./env";

interface BotCallbackConfigRow {
  id: string;
  bot_id: string;
  endpoint_url: string;
  enabled: boolean;
  event_note_created: boolean;
  event_note_edited: boolean;
  signing_secret_encrypted: string;
  updated_at: string;
}

interface CallbackAttemptJob {
  id: string;
  attempts: number;
  event_type: NoteCallbackEvent;
  payload_json: unknown;
  endpoint_url: string;
  enabled: boolean;
  signing_secret_encrypted: string;
}

export interface CallbackDeliveryView {
  id: string;
  note_id: string;
  note_version_id: string;
  event_type: NoteCallbackEvent;
  status: CallbackPostboxStatus;
  attempts: number;
  available_at: string;
  delivered_at: string | null;
  last_http_status: number | null;
  last_error: string | null;
  created_at: string;
}

export interface UpsertCallbackConfigInput {
  accountId: string;
  botId: string;
  endpointUrl: string;
  enabled: boolean;
  events: {
    note_created: boolean;
    note_edited: boolean;
  };
}

function toPublicConfig(row: BotCallbackConfigRow): BotNoteCallbackConfig {
  return {
    id: row.id,
    bot_id: row.bot_id,
    endpoint_url: row.endpoint_url,
    enabled: row.enabled,
    events: {
      note_created: row.event_note_created,
      note_edited: row.event_note_edited
    },
    updated_at: row.updated_at
  };
}

function parsePayload(raw: unknown): NoteCallbackPayload {
  if (typeof raw === "string") {
    return JSON.parse(raw) as NoteCallbackPayload;
  }
  return raw as NoteCallbackPayload;
}

async function failDelivery(
  jobId: string,
  attempts: number,
  status: number | null,
  message: string,
  forceDeadLetter = false
): Promise<void> {
  const env = getEnv();
  const cappedMessage = message.slice(0, 8000);
  const backoffSeconds = Math.min(120, 2 ** attempts);
  const nextStatus = forceDeadLetter || attempts >= env.WORKER_MAX_ATTEMPTS ? "dead_letter" : "failed";

  await query(
    `update callback_postbox_jobs
     set status = $2,
         last_http_status = $3,
         last_error = $4,
         available_at = case when $2 = 'failed' then now() + ($5 || ' seconds')::interval else available_at end,
         updated_at = now()
     where id = $1`,
    [jobId, nextStatus, status, cappedMessage, backoffSeconds]
  );
}

async function deliverAttemptJob(job: CallbackAttemptJob): Promise<boolean> {
  if (!job.enabled) {
    await failDelivery(job.id, job.attempts, null, "Callback disabled", true);
    return false;
  }

  const urlValidation = validateCallbackEndpointUrl(job.endpoint_url);
  if (!urlValidation.ok) {
    await failDelivery(job.id, job.attempts, null, urlValidation.reason, true);
    return false;
  }

  let signingSecret: string;
  try {
    signingSecret = decryptCallbackSecret(job.signing_secret_encrypted);
  } catch (error) {
    await failDelivery(
      job.id,
      job.attempts,
      null,
      error instanceof Error ? `Could not decrypt callback secret: ${error.message}` : "Could not decrypt callback secret",
      true
    );
    return false;
  }

  let payload: NoteCallbackPayload;
  try {
    payload = parsePayload(job.payload_json);
  } catch (error) {
    await failDelivery(
      job.id,
      job.attempts,
      null,
      error instanceof Error ? `Invalid callback payload: ${error.message}` : "Invalid callback payload",
      true
    );
    return false;
  }

  const dispatched = await dispatchCallbackRequest({
    endpointUrl: job.endpoint_url,
    deliveryId: job.id,
    attempt: job.attempts,
    event: job.event_type,
    payload,
    signingSecret
  });

  if (dispatched.ok) {
    await query(
      `update callback_postbox_jobs
       set status = 'delivered',
           delivered_at = now(),
           last_http_status = $2,
           last_error = null,
           updated_at = now()
       where id = $1`,
      [job.id, dispatched.status]
    );
    return true;
  }

  await failDelivery(job.id, job.attempts, dispatched.status, dispatched.error ?? "Callback request failed");
  return false;
}

async function lockCallbackJobById(jobId: string): Promise<CallbackAttemptJob | null> {
  return withTransaction(async (client) => {
    const locked = await client.query<{
      id: string;
      attempts: number;
      event_type: NoteCallbackEvent;
      payload_json: unknown;
      endpoint_url: string;
      enabled: boolean;
      signing_secret_encrypted: string;
    }>(
      `select j.id,
              j.attempts,
              j.event_type,
              j.payload_json,
              c.endpoint_url,
              c.enabled,
              c.signing_secret_encrypted
       from callback_postbox_jobs j
       join bot_note_callbacks c on c.id = j.bot_note_callback_id
       where j.id = $1
         and j.status in ('queued', 'failed')
       for update skip locked`,
      [jobId]
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

export async function processCallbackJobById(jobId: string): Promise<boolean> {
  const locked = await lockCallbackJobById(jobId);
  if (!locked) {
    return false;
  }
  return deliverAttemptJob(locked);
}

export async function getBotCallbackConfig(botId: string): Promise<BotNoteCallbackConfig | null> {
  const found = await query<BotCallbackConfigRow>(
    `select id,
            bot_id,
            endpoint_url,
            enabled,
            event_note_created,
            event_note_edited,
            signing_secret_encrypted,
            updated_at::text
     from bot_note_callbacks
     where bot_id = $1
     limit 1`,
    [botId]
  );

  if (!found.rowCount) {
    return null;
  }

  return toPublicConfig(found.rows[0]);
}

export async function upsertBotCallbackConfig(input: UpsertCallbackConfigInput): Promise<{
  config: BotNoteCallbackConfig;
  createdSecret: string | null;
}> {
  const validation = validateCallbackEndpointUrl(input.endpointUrl);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return withTransaction(async (client) => {
    const existing = await client.query<BotCallbackConfigRow>(
      `select id,
              bot_id,
              endpoint_url,
              enabled,
              event_note_created,
              event_note_edited,
              signing_secret_encrypted,
              updated_at::text
       from bot_note_callbacks
       where bot_id = $1
       limit 1
       for update`,
      [input.botId]
    );

    if (existing.rowCount) {
      const updated = await client.query<BotCallbackConfigRow>(
        `update bot_note_callbacks
         set endpoint_url = $2,
             enabled = $3,
             event_note_created = $4,
             event_note_edited = $5,
             updated_at = now()
         where bot_id = $1
         returning id,
                   bot_id,
                   endpoint_url,
                   enabled,
                   event_note_created,
                   event_note_edited,
                   signing_secret_encrypted,
                   updated_at::text`,
        [input.botId, input.endpointUrl, input.enabled, input.events.note_created, input.events.note_edited]
      );

      return {
        config: toPublicConfig(updated.rows[0]),
        createdSecret: null
      };
    }

    const newSecret = generateCallbackSecret();
    const inserted = await client.query<BotCallbackConfigRow>(
      `insert into bot_note_callbacks (
        bot_id,
        endpoint_url,
        enabled,
        event_note_created,
        event_note_edited,
        signing_secret_encrypted,
        created_by_account_id
      ) values ($1,$2,$3,$4,$5,$6,$7)
      returning id,
                bot_id,
                endpoint_url,
                enabled,
                event_note_created,
                event_note_edited,
                signing_secret_encrypted,
                updated_at::text`,
      [
        input.botId,
        input.endpointUrl,
        input.enabled,
        input.events.note_created,
        input.events.note_edited,
        encryptCallbackSecret(newSecret),
        input.accountId
      ]
    );

    return {
      config: toPublicConfig(inserted.rows[0]),
      createdSecret: newSecret
    };
  });
}

export async function rotateBotCallbackSecret(botId: string): Promise<{
  config: BotNoteCallbackConfig;
  signingSecret: string;
}> {
  const nextSecret = generateCallbackSecret();
  const updated = await query<BotCallbackConfigRow>(
    `update bot_note_callbacks
     set signing_secret_encrypted = $2,
         updated_at = now()
     where bot_id = $1
     returning id,
               bot_id,
               endpoint_url,
               enabled,
               event_note_created,
               event_note_edited,
               signing_secret_encrypted,
               updated_at::text`,
    [botId, encryptCallbackSecret(nextSecret)]
  );

  if (!updated.rowCount) {
    throw new Error("Callback config not found for active bot");
  }

  return {
    config: toPublicConfig(updated.rows[0]),
    signingSecret: nextSecret
  };
}

export async function listBotCallbackDeliveries(
  botId: string,
  status: "all" | "failed" | "dead_letter",
  limit: number
): Promise<CallbackDeliveryView[]> {
  const found = await query<{
    id: string;
    note_id: string;
    note_version_id: string;
    event_type: NoteCallbackEvent;
    status: CallbackPostboxStatus;
    attempts: number;
    available_at: string;
    delivered_at: string | null;
    last_http_status: number | null;
    last_error: string | null;
    created_at: string;
  }>(
    `select id,
            note_id::text,
            note_version_id::text,
            event_type,
            status,
            attempts,
            available_at::text,
            delivered_at::text,
            last_http_status,
            last_error,
            created_at::text
     from callback_postbox_jobs
     where bot_id = $1
       and ($2 = 'all' or status = $2)
     order by created_at desc
     limit $3`,
    [botId, status, limit]
  );

  return found.rows;
}

export async function requeueBotCallbackDelivery(botId: string, deliveryId: string): Promise<CallbackDeliveryView | null> {
  const updated = await query<{
    id: string;
    note_id: string;
    note_version_id: string;
    event_type: NoteCallbackEvent;
    status: CallbackPostboxStatus;
    attempts: number;
    available_at: string;
    delivered_at: string | null;
    last_http_status: number | null;
    last_error: string | null;
    created_at: string;
  }>(
    `update callback_postbox_jobs
     set status = 'queued',
         attempts = 0,
         available_at = now(),
         delivered_at = null,
         last_http_status = null,
         last_error = null,
         updated_at = now()
     where id = $1
       and bot_id = $2
       and status in ('failed', 'dead_letter')
     returning id,
               note_id::text,
               note_version_id::text,
               event_type,
               status,
               attempts,
               available_at::text,
               delivered_at::text,
               last_http_status,
               last_error,
               created_at::text`,
    [deliveryId, botId]
  );

  return updated.rowCount ? updated.rows[0] : null;
}

interface EnqueueNoteCallbackInput {
  client: PoolClient;
  botId: string;
  noteId: string;
  noteVersionId: string;
  event: NoteCallbackEvent;
  payload: NoteCallbackPayload;
}

export async function enqueueNoteCallbackIfConfigured(input: EnqueueNoteCallbackInput): Promise<string | null> {
  const callback = await input.client.query<{
    id: string;
    enabled: boolean;
    event_note_created: boolean;
    event_note_edited: boolean;
  }>(
    `select id,
            enabled,
            event_note_created,
            event_note_edited
     from bot_note_callbacks
     where bot_id = $1
     limit 1`,
    [input.botId]
  );

  if (!callback.rowCount) {
    return null;
  }

  const cfg = callback.rows[0];
  if (!cfg.enabled) {
    return null;
  }
  if (input.event === "note.created" && !cfg.event_note_created) {
    return null;
  }
  if (input.event === "note.edited" && !cfg.event_note_edited) {
    return null;
  }

  const inserted = await input.client.query<{ id: string }>(
    `insert into callback_postbox_jobs (
      bot_note_callback_id,
      bot_id,
      note_id,
      note_version_id,
      event_type,
      payload_json,
      status
    ) values ($1,$2,$3,$4,$5,$6::jsonb,'queued')
    on conflict (bot_note_callback_id, note_version_id, event_type) do nothing
    returning id`,
    [cfg.id, input.botId, input.noteId, input.noteVersionId, input.event, JSON.stringify(input.payload)]
  );

  return inserted.rowCount ? inserted.rows[0].id : null;
}
