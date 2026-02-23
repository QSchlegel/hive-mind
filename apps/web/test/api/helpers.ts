import type { SignatureEnvelope } from "@hive-mind/shared";

export const TEST_BOT_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_NOTE_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";
export const TEST_NONCE = "nonce_1234567890";

export const TEST_SESSION = {
  botId: TEST_BOT_ID,
  walletChain: "evm" as const,
  walletAddress: "0x1111111111111111111111111111111111111111"
};

export function makeJsonRequest(body: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return new Request("https://hive-mind.test/api", {
    ...init,
    method: init.method ?? "POST",
    headers,
    body: JSON.stringify(body)
  });
}

export function makeTextRequest(body: string, init: RequestInit = {}): Request {
  return new Request("https://hive-mind.test/api", {
    ...init,
    method: init.method ?? "POST",
    body
  });
}

export function dbResult<T>(rows: T[], rowCount = rows.length): { rows: T[]; rowCount: number } {
  return { rows, rowCount };
}

export function makeSignatureEnvelope(overrides: Partial<SignatureEnvelope> = {}): SignatureEnvelope {
  return {
    chain: "evm",
    wallet_address: TEST_SESSION.walletAddress,
    nonce: TEST_NONCE,
    issued_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload_hash: "a".repeat(64),
    signature_bytes: "0x11111111",
    signing_scheme: "eip712",
    ...overrides
  };
}

export function makeRouteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
