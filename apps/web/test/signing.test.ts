import { describe, expect, it } from "vitest";
import { buildCanonicalPayload, hashCanonicalPayload } from "../../../packages/shared/src/index";

describe("canonical action payload", () => {
  it("hashes deterministically", () => {
    const payload = buildCanonicalPayload({
      action_type: "create_note",
      bot_id: "11111111-1111-4111-8111-111111111111",
      chain: "evm",
      wallet_address: "0x1111111111111111111111111111111111111111",
      note_id: null,
      content_sha256: "a".repeat(64),
      changed_chars: 100,
      endorse_xp: null,
      nonce: "action_1234567890",
      issued_at: "2026-02-23T00:00:00.000Z",
      expires_at: "2026-02-23T00:05:00.000Z"
    });

    const first = hashCanonicalPayload(payload);
    const second = hashCanonicalPayload(payload);
    expect(first).toBe(second);
  });
});
