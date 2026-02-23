import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as accountMeGet } from "../../app/api/account/me/route";
import { POST as activeBotPost } from "../../app/api/account/active-bot/route";
import { POST as walletLinkChallengePost } from "../../app/api/account/wallets/link/challenge/route";
import { POST as walletLinkVerifyPost } from "../../app/api/account/wallets/link/verify/route";
import { TEST_BOT_ID, TEST_NONCE, dbResult, makeJsonRequest } from "./helpers";

const TEST_ACCOUNT = {
  accountId: "acct_test_1",
  email: "admin@hive-mind.club",
  name: "Test Admin",
  sessionId: "session-1"
};

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  getEnv: vi.fn(),
  requireAccountSession: vi.fn(),
  insertNonce: vi.fn(),
  lockActiveNonce: vi.fn(),
  markNonceUsed: vi.fn(),
  verifyWalletMessageSignature: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  withTransaction: mocks.withTransaction
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv
}));

vi.mock("@/lib/session", () => ({
  requireAccountSession: mocks.requireAccountSession,
  ACTIVE_BOT_COOKIE: "hm_active_bot_id"
}));

vi.mock("@/lib/nonces", () => ({
  insertNonce: mocks.insertNonce,
  lockActiveNonce: mocks.lockActiveNonce,
  markNonceUsed: mocks.markNonceUsed
}));

vi.mock("@/lib/signature-verifier", () => ({
  verifyWalletMessageSignature: mocks.verifyWalletMessageSignature
}));

describe("account API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccountSession.mockResolvedValue(TEST_ACCOUNT);
    mocks.getEnv.mockReturnValue({
      NODE_ENV: "test",
      APP_DOMAIN: "hive-mind.club"
    });
  });

  it("GET /api/account/me returns linked wallet balances", async () => {
    mocks.query.mockResolvedValueOnce(
      dbResult([
        {
          bot_id: TEST_BOT_ID,
          wallet_chain: "evm",
          wallet_address: "0x1111111111111111111111111111111111111111",
          xp_balance: 1200,
          credit_balance_micro_eur: "450000",
          linked_at: "2026-01-01T00:00:00.000Z"
        }
      ])
    );

    const response = await accountMeGet(new Request("https://hive-mind.test/api/account/me", { method: "GET" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.account.id).toBe(TEST_ACCOUNT.accountId);
    expect(json.linked_wallets).toHaveLength(1);
    expect(json.balances.total_xp).toBe(1200);
  });

  it("POST /api/account/active-bot sets active bot cookie", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([{ bot_id: TEST_BOT_ID }]));

    const response = await activeBotPost(
      makeJsonRequest(
        { bot_id: TEST_BOT_ID },
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
    expect(response.headers.get("set-cookie")).toContain("hm_active_bot_id=");
  });

  it("POST /api/account/wallets/link/challenge creates nonce challenge", async () => {
    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) => handler({}));
    mocks.insertNonce.mockResolvedValue({ id: "nonce-row" });

    const response = await walletLinkChallengePost(
      makeJsonRequest(
        {
          wallet_address: "0x1111111111111111111111111111111111111111",
          chain: "evm"
        },
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
    expect(json.message).toContain(`account:${TEST_ACCOUNT.accountId}`);
    expect(mocks.insertNonce).toHaveBeenCalledTimes(1);
  });

  it("POST /api/account/wallets/link/verify rejects invalid wallet signatures", async () => {
    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
      handler({ query: vi.fn() })
    );
    mocks.lockActiveNonce.mockResolvedValue({
      id: "nonce-row",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null
    });
    mocks.verifyWalletMessageSignature.mockResolvedValue({ ok: false, reason: "Invalid EVM signature" });

    const response = await walletLinkVerifyPost(
      makeJsonRequest(
        {
          wallet_address: "0x1111111111111111111111111111111111111111",
          chain: "evm",
          nonce: TEST_NONCE,
          signature: "0x11111111",
          signing_scheme: "eip712"
        },
        {
          headers: {
            origin: "https://hive-mind.club"
          }
        }
      )
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid EVM signature");
  });
});

