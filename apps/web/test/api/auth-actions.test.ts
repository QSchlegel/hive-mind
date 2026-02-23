import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as authChallengePost } from "../../app/api/auth/challenge/route";
import { POST as authVerifyPost } from "../../app/api/auth/verify/route";
import { POST as actionChallengePost } from "../../app/api/actions/challenge/route";
import { TEST_NOTE_ID, TEST_SESSION, makeJsonRequest } from "./helpers";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  insertNonce: vi.fn(),
  requireSession: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  withTransaction: mocks.withTransaction
}));

vi.mock("@/lib/nonces", () => ({
  insertNonce: mocks.insertNonce
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireSession
}));

describe("auth and action challenge routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(TEST_SESSION);
  });

  describe("POST /api/auth/challenge", () => {
    it("returns 410 deprecation response", async () => {
      const response = await authChallengePost(makeJsonRequest({ wallet_address: "x", chain: "evm" }));
      const json = await response.json();

      expect(response.status).toBe(410);
      expect(json.error).toContain("deprecated");
    });
  });

  describe("POST /api/auth/verify", () => {
    it("returns 410 deprecation response", async () => {
      const response = await authVerifyPost(makeJsonRequest({}));
      const json = await response.json();

      expect(response.status).toBe(410);
      expect(json.error).toContain("deprecated");
    });
  });

  describe("POST /api/actions/challenge", () => {
    it("builds a canonical payload and challenge hash", async () => {
      mocks.insertNonce.mockResolvedValue({ id: "nonce-row" });
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler({})
      );

      const response = await actionChallengePost(
        makeJsonRequest({
          action_type: "create_note",
          content_md: "hello world",
          changed_chars: 11
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.payload.action_type).toBe("create_note");
      expect(json.payload.bot_id).toBe(TEST_SESSION.botId);
      expect(json.payload_hash).toHaveLength(64);
      expect(mocks.insertNonce).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when edit challenge is missing note_id", async () => {
      const response = await actionChallengePost(
        makeJsonRequest({
          action_type: "edit_note",
          content_md: "updated content"
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("note_id is required for edit/endorse challenges");
    });

    it("returns 400 for invalid action payload", async () => {
      const response = await actionChallengePost(makeJsonRequest({ action_type: "invalid" }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid action challenge payload");
    });

    it("returns 401 for missing session", async () => {
      mocks.requireSession.mockRejectedValueOnce(new Error("Missing bearer token"));
      const response = await actionChallengePost(
        makeJsonRequest({
          action_type: "endorse_note",
          note_id: TEST_NOTE_ID,
          endorse_xp: 20
        })
      );
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Missing bearer token");
    });
  });
});
