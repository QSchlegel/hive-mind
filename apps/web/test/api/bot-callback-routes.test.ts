import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callbackGet, PUT as callbackPut } from "../../app/api/account/bot-callback/route";
import { POST as rotateSecretPost } from "../../app/api/account/bot-callback/secret/rotate/route";
import { GET as deliveriesGet } from "../../app/api/account/bot-callback/deliveries/route";
import { POST as requeuePost } from "../../app/api/account/bot-callback/deliveries/[id]/requeue/route";
import { TEST_BOT_ID, makeJsonRequest, makeRouteParams } from "./helpers";

const TEST_LINKED_SESSION = {
  accountId: "acct_test_1",
  email: "admin@hive-mind.club",
  name: "Test Admin",
  sessionId: "session-1",
  botId: TEST_BOT_ID,
  walletChain: "evm" as const,
  walletAddress: "0x1111111111111111111111111111111111111111"
};

const mocks = vi.hoisted(() => ({
  requireLinkedBot: vi.fn(),
  getEnv: vi.fn(),
  getBotCallbackConfig: vi.fn(),
  upsertBotCallbackConfig: vi.fn(),
  rotateBotCallbackSecret: vi.fn(),
  listBotCallbackDeliveries: vi.fn(),
  requeueBotCallbackDelivery: vi.fn()
}));

vi.mock("@/lib/session", () => ({
  requireLinkedBot: mocks.requireLinkedBot
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv
}));

vi.mock("@/lib/note-callbacks", () => ({
  getBotCallbackConfig: mocks.getBotCallbackConfig,
  upsertBotCallbackConfig: mocks.upsertBotCallbackConfig,
  rotateBotCallbackSecret: mocks.rotateBotCallbackSecret,
  listBotCallbackDeliveries: mocks.listBotCallbackDeliveries,
  requeueBotCallbackDelivery: mocks.requeueBotCallbackDelivery
}));

describe("bot callback account API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLinkedBot.mockResolvedValue(TEST_LINKED_SESSION);
    mocks.getEnv.mockReturnValue({
      NODE_ENV: "test",
      APP_DOMAIN: "hive-mind.club"
    });
  });

  it("GET /api/account/bot-callback returns callback config", async () => {
    mocks.getBotCallbackConfig.mockResolvedValueOnce({
      id: "cb-1",
      bot_id: TEST_BOT_ID,
      endpoint_url: "https://bot.example/callback",
      enabled: true,
      events: { note_created: true, note_edited: true },
      updated_at: "2026-01-01T00:00:00.000Z"
    });

    const response = await callbackGet(new Request("https://hive-mind.test/api/account/bot-callback", { method: "GET" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.callback.endpoint_url).toBe("https://bot.example/callback");
  });

  it("GET /api/account/bot-callback rejects unauthenticated access", async () => {
    mocks.requireLinkedBot.mockRejectedValueOnce(new Error("Missing authenticated account session"));

    const response = await callbackGet(new Request("https://hive-mind.test/api/account/bot-callback", { method: "GET" }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Missing authenticated account session");
  });

  it("PUT /api/account/bot-callback upserts callback config", async () => {
    mocks.upsertBotCallbackConfig.mockResolvedValueOnce({
      config: {
        id: "cb-1",
        bot_id: TEST_BOT_ID,
        endpoint_url: "https://bot.example/callback",
        enabled: true,
        events: { note_created: true, note_edited: false },
        updated_at: "2026-01-01T00:00:00.000Z"
      },
      createdSecret: "secret_once"
    });

    const response = await callbackPut(
      makeJsonRequest(
        {
          endpoint_url: "https://bot.example/callback",
          enabled: true,
          events: {
            note_created: true,
            note_edited: false
          }
        },
        {
          method: "PUT",
          headers: {
            origin: "https://hive-mind.club"
          }
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.signing_secret).toBe("secret_once");
    expect(mocks.upsertBotCallbackConfig).toHaveBeenCalledTimes(1);
  });

  it("PUT /api/account/bot-callback rejects invalid payload", async () => {
    const response = await callbackPut(
      makeJsonRequest(
        {
          endpoint_url: "not-a-url",
          enabled: true,
          events: {
            note_created: true,
            note_edited: true
          }
        },
        {
          method: "PUT",
          headers: {
            origin: "https://hive-mind.club"
          }
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid callback config payload");
  });

  it("POST /api/account/bot-callback/secret/rotate returns new signing secret", async () => {
    mocks.rotateBotCallbackSecret.mockResolvedValueOnce({
      config: {
        id: "cb-1",
        bot_id: TEST_BOT_ID,
        endpoint_url: "https://bot.example/callback",
        enabled: true,
        events: { note_created: true, note_edited: true },
        updated_at: "2026-01-01T00:00:00.000Z"
      },
      signingSecret: "new_secret"
    });

    const response = await rotateSecretPost(
      makeJsonRequest(
        {},
        {
          headers: {
            origin: "https://hive-mind.club"
          }
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.signing_secret).toBe("new_secret");
  });

  it("GET /api/account/bot-callback/deliveries returns filtered deliveries", async () => {
    mocks.listBotCallbackDeliveries.mockResolvedValueOnce([
      {
        id: "delivery-1",
        note_id: "note-1",
        note_version_id: "ver-1",
        event_type: "note.edited",
        status: "failed",
        attempts: 2,
        available_at: "2026-01-01T00:00:00.000Z",
        delivered_at: null,
        last_http_status: 500,
        last_error: "Callback endpoint responded with 500",
        created_at: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const response = await deliveriesGet(new Request("https://hive-mind.test/api/account/bot-callback/deliveries?status=failed&limit=5"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.status_filter).toBe("failed");
    expect(json.deliveries).toHaveLength(1);
  });

  it("POST /api/account/bot-callback/deliveries/:id/requeue returns 404 when delivery is missing", async () => {
    mocks.requeueBotCallbackDelivery.mockResolvedValueOnce(null);

    const response = await requeuePost(
      makeJsonRequest(
        {},
        {
          headers: {
            origin: "https://hive-mind.club"
          }
        }
      ),
      makeRouteParams("missing-delivery")
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Callback delivery not found for active bot");
  });
});
