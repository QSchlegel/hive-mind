import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbResult } from "./helpers";
import { processCallbackJobById, requeueBotCallbackDelivery } from "../../lib/note-callbacks";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  query: vi.fn(),
  dispatchCallbackRequest: vi.fn(),
  decryptCallbackSecret: vi.fn(),
  encryptCallbackSecret: vi.fn(),
  generateCallbackSecret: vi.fn(),
  validateCallbackEndpointUrl: vi.fn(),
  getEnv: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  withTransaction: mocks.withTransaction,
  query: mocks.query
}));

vi.mock("../../lib/callback-dispatch", () => ({
  dispatchCallbackRequest: mocks.dispatchCallbackRequest,
  decryptCallbackSecret: mocks.decryptCallbackSecret,
  encryptCallbackSecret: mocks.encryptCallbackSecret,
  generateCallbackSecret: mocks.generateCallbackSecret,
  validateCallbackEndpointUrl: mocks.validateCallbackEndpointUrl
}));

vi.mock("../../lib/env", () => ({
  getEnv: mocks.getEnv
}));

describe("note callbacks library", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEnv.mockReturnValue({
      NODE_ENV: "test",
      WORKER_MAX_ATTEMPTS: 3
    });
    mocks.validateCallbackEndpointUrl.mockReturnValue({ ok: true });
    mocks.decryptCallbackSecret.mockReturnValue("secret");
    mocks.encryptCallbackSecret.mockReturnValue("encrypted");
    mocks.generateCallbackSecret.mockReturnValue("secret");
    mocks.query.mockResolvedValue(dbResult([], 1));
  });

  it("marks callback jobs as delivered on successful dispatch", async () => {
    mocks.dispatchCallbackRequest.mockResolvedValueOnce({ ok: true, status: 200, error: null });
    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
      handler({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from callback_postbox_jobs")) {
            return dbResult([
              {
                id: "job-1",
                attempts: 0,
                event_type: "note.created",
                payload_json: { source: "hive-mind" },
                endpoint_url: "https://bot.example/callback",
                enabled: true,
                signing_secret_encrypted: "encrypted"
              }
            ]);
          }
          return dbResult([], 1);
        })
      })
    );

    const processed = await processCallbackJobById("job-1");

    expect(processed).toBe(true);
    expect(mocks.dispatchCallbackRequest).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("set status = 'delivered'"), ["job-1", 200]);
  });

  it("marks callback jobs as failed when endpoint responds non-2xx", async () => {
    mocks.dispatchCallbackRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: "Callback endpoint responded with 500"
    });
    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
      handler({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from callback_postbox_jobs")) {
            return dbResult([
              {
                id: "job-2",
                attempts: 0,
                event_type: "note.edited",
                payload_json: { source: "hive-mind" },
                endpoint_url: "https://bot.example/callback",
                enabled: true,
                signing_secret_encrypted: "encrypted"
              }
            ]);
          }
          return dbResult([], 1);
        })
      })
    );

    const processed = await processCallbackJobById("job-2");

    expect(processed).toBe(false);
    const failCall = mocks.query.mock.calls.find((entry) => String(entry[0]).includes("set status = $2"));
    expect(failCall).toBeTruthy();
    expect(failCall?.[1]?.[1]).toBe("failed");
    expect(failCall?.[1]?.[2]).toBe(500);
  });

  it("dead-letters callback jobs after max attempts", async () => {
    mocks.getEnv.mockReturnValueOnce({
      NODE_ENV: "test",
      WORKER_MAX_ATTEMPTS: 1
    });
    mocks.dispatchCallbackRequest.mockResolvedValueOnce({
      ok: false,
      status: 502,
      error: "Callback endpoint responded with 502"
    });
    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
      handler({
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from callback_postbox_jobs")) {
            return dbResult([
              {
                id: "job-3",
                attempts: 0,
                event_type: "note.created",
                payload_json: { source: "hive-mind" },
                endpoint_url: "https://bot.example/callback",
                enabled: true,
                signing_secret_encrypted: "encrypted"
              }
            ]);
          }
          return dbResult([], 1);
        })
      })
    );

    const processed = await processCallbackJobById("job-3");

    expect(processed).toBe(false);
    const failCall = mocks.query.mock.calls.find((entry) => String(entry[0]).includes("set status = $2"));
    expect(failCall).toBeTruthy();
    expect(failCall?.[1]?.[1]).toBe("dead_letter");
  });

  it("requeues failed callback deliveries", async () => {
    mocks.query.mockResolvedValueOnce(
      dbResult([
        {
          id: "delivery-1",
          note_id: "note-1",
          note_version_id: "version-1",
          event_type: "note.created",
          status: "queued",
          attempts: 0,
          available_at: "2026-01-01T00:00:00.000Z",
          delivered_at: null,
          last_http_status: null,
          last_error: null,
          created_at: "2026-01-01T00:00:00.000Z"
        }
      ])
    );

    const result = await requeueBotCallbackDelivery("bot-1", "delivery-1");

    expect(result?.status).toBe("queued");
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("set status = 'queued'"),
      ["delivery-1", "bot-1"]
    );
  });
});
