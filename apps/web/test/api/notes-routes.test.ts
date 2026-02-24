import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createNotePost } from "../../app/api/notes/route";
import { PATCH as editNotePatch } from "../../app/api/notes/[id]/route";
import { POST as endorseNotePost } from "../../app/api/notes/[id]/endorse/route";
import { POST as reportNotePost } from "../../app/api/notes/[id]/report/route";
import { GET as noteVersionsGet } from "../../app/api/notes/[id]/versions/route";
import {
  TEST_BOT_ID,
  TEST_NOTE_ID,
  TEST_SESSION,
  dbResult,
  makeJsonRequest,
  makeRouteParams,
  makeSignatureEnvelope
} from "./helpers";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  query: vi.fn(),
  lockBot: vi.fn(),
  resolveDailyEndorseSpent: vi.fn(),
  verifyAndPersistActionSignature: vi.fn(),
  moderateContent: vi.fn(),
  requireSession: vi.fn(),
  enqueueNoteCallbackIfConfigured: vi.fn(),
  processCallbackJobById: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  withTransaction: mocks.withTransaction,
  query: mocks.query
}));

vi.mock("@/lib/bot-balance", () => ({
  lockBot: mocks.lockBot,
  resolveDailyEndorseSpent: mocks.resolveDailyEndorseSpent
}));

vi.mock("@/lib/actions", () => ({
  verifyAndPersistActionSignature: mocks.verifyAndPersistActionSignature
}));

vi.mock("@/lib/moderation", () => ({
  moderateContent: mocks.moderateContent
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireSession
}));

vi.mock("@/lib/note-callbacks", () => ({
  enqueueNoteCallbackIfConfigured: mocks.enqueueNoteCallbackIfConfigured,
  processCallbackJobById: mocks.processCallbackJobById
}));

describe("notes API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireSession.mockResolvedValue(TEST_SESSION);
    mocks.lockBot.mockResolvedValue({
      id: TEST_BOT_ID,
      xp_balance: 10_000,
      credit_balance_micro_eur: 10_000,
      daily_endorse_xp_spent: 0,
      daily_reset_at: new Date().toISOString()
    });
    mocks.resolveDailyEndorseSpent.mockReturnValue(0);
    mocks.verifyAndPersistActionSignature.mockResolvedValue({ actionSignatureId: "sig-1" });
    mocks.moderateContent.mockReturnValue({ approved: true });
    mocks.enqueueNoteCallbackIfConfigured.mockResolvedValue(null);
    mocks.processCallbackJobById.mockResolvedValue(false);
  });

  describe("POST /api/notes", () => {
    it("creates a note and its first version", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into notes")) {
            return dbResult([{ id: TEST_NOTE_ID, slug: "test-note" }]);
          }
          if (sql.includes("insert into note_versions")) {
            return dbResult([{ id: "version-1" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await createNotePost(
        makeJsonRequest({
          title: "Test Note",
          content_md: "Hello [[beta]] #tag",
          signature: makeSignatureEnvelope()
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.note_id).toBe(TEST_NOTE_ID);
      expect(json.version).toBe(1);
      expect(json.pricing.costMicroEur).toBeGreaterThan(0);
      expect(mocks.verifyAndPersistActionSignature).toHaveBeenCalledTimes(1);
      expect(mocks.processCallbackJobById).not.toHaveBeenCalled();
    });

    it("enqueues callback jobs and attempts immediate delivery when configured", async () => {
      mocks.enqueueNoteCallbackIfConfigured.mockResolvedValueOnce("callback-job-1");

      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into notes")) {
            return dbResult([{ id: TEST_NOTE_ID, slug: "test-note" }]);
          }
          if (sql.includes("insert into note_versions")) {
            return dbResult([{ id: "version-1" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await createNotePost(
        makeJsonRequest({
          title: "Callback note",
          content_md: "Hello callback",
          signature: makeSignatureEnvelope()
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mocks.enqueueNoteCallbackIfConfigured).toHaveBeenCalledTimes(1);
      expect(mocks.enqueueNoteCallbackIfConfigured).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            metrics: expect.objectContaining({ social_callbacks: 1 })
          })
        })
      );
      expect(mocks.processCallbackJobById).toHaveBeenCalledWith("callback-job-1");
    });

    it("returns 400 for insufficient credit", async () => {
      mocks.lockBot.mockResolvedValueOnce({
        id: TEST_BOT_ID,
        xp_balance: 100,
        credit_balance_micro_eur: 0,
        daily_endorse_xp_spent: 0,
        daily_reset_at: new Date().toISOString()
      });
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: vi.fn() })
      );

      const response = await createNotePost(
        makeJsonRequest({
          title: "Test Note",
          content_md: "Expensive content",
          signature: makeSignatureEnvelope()
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Insufficient credit balance");
    });

    it("returns 400 for invalid create payload", async () => {
      const response = await createNotePost(
        makeJsonRequest({
          title: "x",
          content_md: "",
          signature: makeSignatureEnvelope()
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid create note payload");
    });
  });

  describe("PATCH /api/notes/:id", () => {
    it("edits a note and creates a new version", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from notes where id = $1")) {
            return dbResult([
              {
                id: TEST_NOTE_ID,
                slug: "test-note",
                author_bot_id: TEST_BOT_ID,
                title: "Old title",
                current_content_md: "old content",
                current_version: 2
              }
            ]);
          }
          if (sql.includes("insert into note_versions")) {
            return dbResult([{ id: "version-3" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await editNotePatch(
        makeJsonRequest({
          title: "Updated",
          content_md: "old content plus more",
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.note_id).toBe(TEST_NOTE_ID);
      expect(json.version).toBe(3);
      expect(mocks.processCallbackJobById).not.toHaveBeenCalled();
    });

    it("does not fail note edits when callback delivery fails", async () => {
      mocks.enqueueNoteCallbackIfConfigured.mockResolvedValueOnce("callback-job-2");
      mocks.processCallbackJobById.mockRejectedValueOnce(new Error("callback timeout"));

      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from notes where id = $1")) {
            return dbResult([
              {
                id: TEST_NOTE_ID,
                slug: "test-note",
                author_bot_id: TEST_BOT_ID,
                title: "Old title",
                current_content_md: "old content",
                current_version: 2
              }
            ]);
          }
          if (sql.includes("insert into note_versions")) {
            return dbResult([{ id: "version-3" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await editNotePatch(
        makeJsonRequest({
          title: "Updated",
          content_md: "old content plus more",
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(mocks.enqueueNoteCallbackIfConfigured).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            metrics: expect.objectContaining({ social_callbacks: 1 })
          })
        })
      );
      expect(mocks.processCallbackJobById).toHaveBeenCalledWith("callback-job-2");
    });

    it("returns 400 when note is missing", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from notes where id = $1")) {
            return dbResult([], 0);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await editNotePatch(
        makeJsonRequest({
          content_md: "new body",
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Note not found");
    });

    it("returns 400 when a different bot edits the note", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("from notes where id = $1")) {
            return dbResult([
              {
                id: TEST_NOTE_ID,
                slug: "test-note",
                author_bot_id: "44444444-4444-4444-8444-444444444444",
                title: "Old title",
                current_content_md: "old content",
                current_version: 2
              }
            ]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await editNotePatch(
        makeJsonRequest({
          content_md: "new body",
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Only the author bot can edit this note");
    });
  });

  describe("POST /api/notes/:id/endorse", () => {
    it("creates an endorsement and cashback transfer", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("select id, author_bot_id from notes")) {
            return dbResult([{ id: TEST_NOTE_ID, author_bot_id: "55555555-5555-4555-8555-555555555555" }]);
          }
          if (sql.includes("insert into endorsements")) {
            return dbResult([{ id: "endorsement-1" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await endorseNotePost(
        makeJsonRequest({
          xp_spent: 250,
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.endorsement_id).toBe("endorsement-1");
      expect(json.cashback_micro_eur).toBe(2500);
      expect(json.xp_spent).toBe(250);
    });

    it("returns 400 for self-endorsement", async () => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("select id, author_bot_id from notes")) {
            return dbResult([{ id: TEST_NOTE_ID, author_bot_id: TEST_BOT_ID }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await endorseNotePost(
        makeJsonRequest({
          xp_spent: 10,
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Self endorsement is not allowed");
    });

    it("returns 400 when XP balance is insufficient", async () => {
      mocks.lockBot.mockResolvedValueOnce({
        id: TEST_BOT_ID,
        xp_balance: 5,
        credit_balance_micro_eur: 0,
        daily_endorse_xp_spent: 0,
        daily_reset_at: new Date().toISOString()
      });
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("select id, author_bot_id from notes")) {
            return dbResult([{ id: TEST_NOTE_ID, author_bot_id: "66666666-6666-4666-8666-666666666666" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await endorseNotePost(
        makeJsonRequest({
          xp_spent: 10,
          signature: makeSignatureEnvelope()
        }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Insufficient XP balance");
    });
  });

  describe("POST /api/notes/:id/report", () => {
    it("creates a moderation report", async () => {
      mocks.query.mockResolvedValueOnce(dbResult([{ id: "report-1" }]));
      const response = await reportNotePost(
        makeJsonRequest({ reason: "Spam and abusive content in this note." }),
        makeRouteParams(TEST_NOTE_ID)
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ ok: true, report_id: "report-1" });
    });

    it("returns 400 for invalid report payload", async () => {
      const response = await reportNotePost(makeJsonRequest({ reason: "bad" }), makeRouteParams(TEST_NOTE_ID));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid report payload");
    });
  });

  describe("GET /api/notes/:id/versions", () => {
    it("returns all note versions", async () => {
      mocks.query.mockResolvedValueOnce(
        dbResult([
          {
            id: "v2",
            version: 2,
            changed_chars: 40,
            xp_minted: 40,
            cost_micro_eur: 40,
            created_at: "2026-01-01T00:00:00.000Z",
            git_commit_sha: null,
            ipfs_cid: null
          }
        ])
      );

      const response = await noteVersionsGet(new Request("https://hive-mind.test", { method: "GET" }), makeRouteParams(TEST_NOTE_ID));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.versions).toHaveLength(1);
    });

    it("returns 500 when fetching versions fails", async () => {
      mocks.query.mockRejectedValueOnce(new Error("db down"));
      const response = await noteVersionsGet(new Request("https://hive-mind.test", { method: "GET" }), makeRouteParams(TEST_NOTE_ID));

      expect(response.status).toBe(500);
    });
  });
});
