import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as graphGet } from "../../app/api/graph/route";
import { POST as waitlistPost } from "../../app/api/waitlist/route";
import { POST as redeemInvitePost } from "../../app/api/invites/redeem/route";
import { TEST_BOT_ID, dbResult, makeJsonRequest } from "./helpers";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  withTransaction: mocks.withTransaction
}));

describe("public API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/graph", () => {
    it("returns graph nodes and resolved edges", async () => {
      mocks.query
        .mockResolvedValueOnce(
          dbResult([
            { id: "n1", label: "alpha", xp: 12 },
            { id: "n2", label: "beta", xp: 4 }
          ])
        )
        .mockResolvedValueOnce(
          dbResult([
            { source: "n1", target: "beta", type: "wiki_link" },
            { source: "n9", target: "external", type: "tag" }
          ])
        );

      const response = await graphGet();
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.nodes).toEqual([
        { id: "alpha", label: "alpha", xp: 12 },
        { id: "beta", label: "beta", xp: 4 }
      ]);
      expect(json.edges).toEqual([
        { source: "alpha", target: "beta", type: "wiki_link" },
        { source: "n9", target: "external", type: "tag" }
      ]);
    });

    it("returns 500 on database failure", async () => {
      mocks.query.mockRejectedValueOnce(new Error("db error"));
      const response = await graphGet();

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/waitlist", () => {
    it("creates a waitlist entry", async () => {
      mocks.query.mockResolvedValueOnce(dbResult([{ id: "wait-1", status: "pending" }]));
      const response = await waitlistPost(
        makeJsonRequest({
          email: "Bot@Example.com",
          wallet_address: "0x1111111111111111111111111111111111111111",
          wallet_chain: "evm",
          bot_use_case: "I want to publish reproducible research summaries.",
          privacy_consent: true
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        waitlist_id: "wait-1",
        status: "pending"
      });
      expect(mocks.query).toHaveBeenCalledWith(expect.any(String), [
        "bot@example.com",
        "0x1111111111111111111111111111111111111111",
        "evm",
        "I want to publish reproducible research summaries."
      ]);
    });

    it("updates an existing waitlist entry and preserves approved status", async () => {
      mocks.query.mockResolvedValueOnce(dbResult([{ id: "wait-1", status: "approved" }]));
      const response = await waitlistPost(
        makeJsonRequest({
          email: "bot@example.com",
          wallet_address: "0x1111111111111111111111111111111111111111",
          wallet_chain: "evm",
          bot_use_case: "I want to publish reproducible research summaries.",
          privacy_consent: true
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        waitlist_id: "wait-1",
        status: "approved"
      });
    });

    it("skips inserts for honeypot submissions", async () => {
      const response = await waitlistPost(
        makeJsonRequest({
          email: "bot@example.com",
          wallet_address: "0x1111111111111111111111111111111111111111",
          wallet_chain: "evm",
          bot_use_case: "I want to publish reproducible research summaries.",
          privacy_consent: true,
          company: "spam-bot"
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        status: "pending"
      });
      expect(mocks.query).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid waitlist payload", async () => {
      const response = await waitlistPost(
        makeJsonRequest({
          email: "not-an-email",
          wallet_address: "0x1",
          wallet_chain: "evm",
          bot_use_case: "short",
          privacy_consent: false
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid waitlist payload");
    });

    it("returns 403 for untrusted origins", async () => {
      const response = await waitlistPost(
        makeJsonRequest(
          {
            email: "bot@example.com",
            wallet_address: "0x1111111111111111111111111111111111111111",
            wallet_chain: "evm",
            bot_use_case: "I want to publish reproducible research summaries.",
            privacy_consent: true
          },
          {
            headers: {
              origin: "https://evil.example"
            }
          }
        )
      );
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden request origin");
    });
  });

  describe("POST /api/invites/redeem", () => {
    it("validates an active invite code", async () => {
      const client = {
        query: vi.fn().mockResolvedValueOnce(
          dbResult([
            {
              id: "invite-1",
              code: "ALPHA-123",
              status: "active",
              expires_at: new Date(Date.now() + 60_000).toISOString()
            }
          ])
        )
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await redeemInvitePost(makeJsonRequest({ code: "ALPHA-123" }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({
        ok: true,
        code: "ALPHA-123",
        status: "valid"
      });
    });

    it("redeems an active invite for a bot", async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(
            dbResult([
              {
                id: "invite-1",
                code: "ALPHA-123",
                status: "active",
                expires_at: new Date(Date.now() + 60_000).toISOString()
              }
            ])
          )
          .mockResolvedValueOnce(dbResult([], 1))
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await redeemInvitePost(makeJsonRequest({ code: "ALPHA-123", bot_id: TEST_BOT_ID }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("redeemed");
      expect(client.query).toHaveBeenCalledTimes(2);
    });

    it("expires stale invite codes and returns a 400", async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce(
            dbResult([
              {
                id: "invite-1",
                code: "ALPHA-123",
                status: "active",
                expires_at: new Date(Date.now() - 60_000).toISOString()
              }
            ])
          )
          .mockResolvedValueOnce(dbResult([], 1))
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await redeemInvitePost(makeJsonRequest({ code: "ALPHA-123" }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invite code expired");
      expect(client.query).toHaveBeenCalledTimes(2);
    });

    it("returns 400 for invalid invite payload", async () => {
      const response = await redeemInvitePost(makeJsonRequest({ code: "x" }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid invite redeem payload");
    });
  });
});
