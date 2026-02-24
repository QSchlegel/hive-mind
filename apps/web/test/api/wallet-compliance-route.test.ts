import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as walletCompliancePost } from "../../app/api/wallets/compliance/test/route";
import { makeJsonRequest } from "./helpers";

const mocks = vi.hoisted(() => ({
  verifyWalletMessageSignature: vi.fn()
}));

vi.mock("@/lib/signature-verifier", () => ({
  verifyWalletMessageSignature: mocks.verifyWalletMessageSignature
}));

describe("wallet compliance test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts direct-signing verification without wallet abstraction", async () => {
    mocks.verifyWalletMessageSignature.mockResolvedValue({ ok: true });

    const response = await walletCompliancePost(
      makeJsonRequest({
        chain: "evm",
        wallet_address: "0x1111111111111111111111111111111111111111",
        message: "hive-mind wallet compliance test",
        signature: "0x11111111",
        signature_metadata: {
          crypto_alg: "eip712"
        }
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.compliant).toBe(true);
    expect(json.reason).toBeNull();
    expect(json.wallet_abstraction.provided).toBe(false);
    expect(json.signature).toEqual({
      verified: true,
      crypto_alg: "eip712",
      public_key: null
    });
    expect(mocks.verifyWalletMessageSignature).toHaveBeenCalledWith({
      chain: "evm",
      walletAddress: "0x1111111111111111111111111111111111111111",
      message: "hive-mind wallet compliance test",
      signature: "0x11111111",
      signingScheme: "eip712",
      key: undefined,
      publicKey: undefined
    });
  });

  it("returns non-compliant when signature verification fails", async () => {
    mocks.verifyWalletMessageSignature.mockResolvedValue({
      ok: false,
      reason: "Invalid EVM auth signature"
    });

    const response = await walletCompliancePost(
      makeJsonRequest({
        chain: "evm",
        wallet_address: "0x1111111111111111111111111111111111111111",
        message: "hive-mind wallet compliance test",
        signature: "0x11111111",
        wallet_abstraction: {
          provider: "test-provider",
          account_ref: "wa_123"
        },
        signature_metadata: {
          crypto_alg: "eip712"
        }
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.compliant).toBe(false);
    expect(json.reason).toBe("Invalid EVM auth signature");
    expect(json.wallet_abstraction.provided).toBe(true);
    expect(json.signature.verified).toBe(false);
  });

  it("returns non-compliant on chain/algorithm mismatch without verifying signature", async () => {
    const response = await walletCompliancePost(
      makeJsonRequest({
        chain: "evm",
        wallet_address: "0x1111111111111111111111111111111111111111",
        message: "hive-mind wallet compliance test",
        signature: "0x11111111",
        signature_metadata: {
          crypto_alg: "bip322"
        }
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.compliant).toBe(false);
    expect(json.reason).toBe("crypto_alg bip322 does not match chain evm");
    expect(mocks.verifyWalletMessageSignature).not.toHaveBeenCalled();
  });

  it("accepts pub_key alias in signature metadata", async () => {
    mocks.verifyWalletMessageSignature.mockResolvedValue({ ok: true });

    const response = await walletCompliancePost(
      makeJsonRequest({
        chain: "bitcoin",
        wallet_address: "bc1qtestwalletaddress",
        message: "hive-mind wallet compliance test",
        signature: "30440220abcdef",
        signature_metadata: {
          crypto_alg: "bip322",
          pub_key: "02abc123"
        }
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.compliant).toBe(true);
    expect(json.signature.public_key).toBe("02abc123");
    expect(mocks.verifyWalletMessageSignature).toHaveBeenCalledWith({
      chain: "bitcoin",
      walletAddress: "bc1qtestwalletaddress",
      message: "hive-mind wallet compliance test",
      signature: "30440220abcdef",
      signingScheme: "bip322",
      key: undefined,
      publicKey: "02abc123"
    });
  });

  it("returns 400 for invalid payload", async () => {
    const response = await walletCompliancePost(
      makeJsonRequest({
        chain: "evm",
        wallet_address: "0x1111111111111111111111111111111111111111",
        message: "hive-mind wallet compliance test",
        signature: "0x11111111"
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid wallet compliance test payload");
  });
});
