import { verifyMessage } from "viem";
import {
  canonicalPayloadSchema,
  hashCanonicalPayload,
  type CanonicalActionPayload,
  type SignatureEnvelope,
  type WalletChain
} from "@hive-mind/shared";
import { getEnv } from "./env";

export interface SignatureVerificationResult {
  ok: boolean;
  reason?: string;
}

function normalizeAddress(chain: WalletChain, address: string): string {
  if (chain === "evm") {
    return address.toLowerCase();
  }
  return address.trim();
}

function isChainEnabled(chain: WalletChain): boolean {
  const env = getEnv();
  if (chain === "evm") return env.CHAIN_EVM_ENABLED;
  if (chain === "cardano") return env.CHAIN_CARDANO_ENABLED;
  return env.CHAIN_BITCOIN_ENABLED;
}

async function resolveBitcoinNetwork() {
  const { bitcoin } = await import("@meshsdk/bitcoin");
  const network = getEnv().BITCOIN_NETWORK;
  if (network === "regtest") {
    return bitcoin.networks.regtest;
  }
  return network;
}

export async function verifyActionSignature(
  payload: CanonicalActionPayload,
  envelope: SignatureEnvelope
): Promise<SignatureVerificationResult> {
  canonicalPayloadSchema.parse(payload);

  if (payload.chain !== envelope.chain) {
    return { ok: false, reason: "Chain mismatch" };
  }

  if (normalizeAddress(payload.chain, payload.wallet_address) !== normalizeAddress(payload.chain, envelope.wallet_address)) {
    return { ok: false, reason: "Wallet mismatch" };
  }

  if (!isChainEnabled(payload.chain)) {
    return { ok: false, reason: `Chain ${payload.chain} is disabled` };
  }

  const now = Date.now();
  const issuedAt = Date.parse(envelope.issued_at);
  const expiresAt = Date.parse(envelope.expires_at);

  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "Invalid signature timestamps" };
  }

  if (issuedAt > now + 60_000) {
    return { ok: false, reason: "Signature issued in the future" };
  }

  if (expiresAt < now) {
    return { ok: false, reason: "Signature expired" };
  }

  const expectedHash = hashCanonicalPayload(payload);
  if (expectedHash !== envelope.payload_hash) {
    return { ok: false, reason: "Payload hash mismatch" };
  }

  if (payload.chain === "evm") {
    const isValid = await verifyMessage({
      address: payload.wallet_address as `0x${string}`,
      message: envelope.payload_hash,
      signature: envelope.signature_bytes as `0x${string}`
    }).catch(() => false);

    return isValid ? { ok: true } : { ok: false, reason: "Invalid EVM signature" };
  }

  if (payload.chain === "cardano") {
    const { checkSignature } = await import("@meshsdk/core");
    if (!envelope.key) {
      return { ok: false, reason: "Missing Cardano key in signature envelope" };
    }

    const isValid = await checkSignature(
      envelope.payload_hash,
      {
        key: envelope.key,
        signature: envelope.signature_bytes
      },
      payload.wallet_address
    ).catch(() => false);

    return isValid ? { ok: true } : { ok: false, reason: "Invalid Cardano signature" };
  }

  if (!envelope.public_key) {
    return { ok: false, reason: "Missing Bitcoin public_key" };
  }

  const { resolveAddress, verifySignature: verifyBitcoinSignature } = await import("@meshsdk/bitcoin");
  const signatureValid = verifyBitcoinSignature(envelope.payload_hash, envelope.signature_bytes, envelope.public_key);
  if (!signatureValid) {
    return { ok: false, reason: "Invalid Bitcoin signature" };
  }

  const resolved = resolveAddress(Buffer.from(envelope.public_key, "hex"), await resolveBitcoinNetwork());
  if (normalizeAddress("bitcoin", resolved.address) !== normalizeAddress("bitcoin", payload.wallet_address)) {
    return { ok: false, reason: "Bitcoin public key does not resolve to wallet address" };
  }

  return { ok: true };
}

export async function verifyWalletMessageSignature(params: {
  chain: WalletChain;
  walletAddress: string;
  message: string;
  signature: string;
  signingScheme: "eip712" | "cip8" | "bip322";
  key?: string;
  publicKey?: string;
}): Promise<SignatureVerificationResult> {
  if (!isChainEnabled(params.chain)) {
    return { ok: false, reason: `Chain ${params.chain} is disabled` };
  }

  if (params.chain === "evm") {
    const isValid = await verifyMessage({
      address: params.walletAddress as `0x${string}`,
      message: params.message,
      signature: params.signature as `0x${string}`
    }).catch(() => false);

    return isValid ? { ok: true } : { ok: false, reason: "Invalid EVM auth signature" };
  }

  if (params.chain === "cardano") {
    const { checkSignature } = await import("@meshsdk/core");
    if (!params.key) {
      return { ok: false, reason: "Missing Cardano key" };
    }

    const isValid = await checkSignature(
      params.message,
      {
        key: params.key,
        signature: params.signature
      },
      params.walletAddress
    ).catch(() => false);

    return isValid ? { ok: true } : { ok: false, reason: "Invalid Cardano auth signature" };
  }

  if (!params.publicKey) {
    return { ok: false, reason: "Missing Bitcoin public key" };
  }

  const { resolveAddress, verifySignature: verifyBitcoinSignature } = await import("@meshsdk/bitcoin");
  const isValid = verifyBitcoinSignature(params.message, params.signature, params.publicKey);
  if (!isValid) {
    return { ok: false, reason: "Invalid Bitcoin auth signature" };
  }

  const resolved = resolveAddress(Buffer.from(params.publicKey, "hex"), await resolveBitcoinNetwork());
  if (normalizeAddress("bitcoin", resolved.address) !== normalizeAddress("bitcoin", params.walletAddress)) {
    return { ok: false, reason: "Bitcoin pubkey/address mismatch" };
  }

  return { ok: true };
}

export async function verifyAuthSignature(params: {
  chain: WalletChain;
  walletAddress: string;
  nonce: string;
  signature: string;
  signingScheme: "eip712" | "cip8" | "bip322";
  key?: string;
  publicKey?: string;
}): Promise<SignatureVerificationResult> {
  return verifyWalletMessageSignature({
    chain: params.chain,
    walletAddress: params.walletAddress,
    message: `hive-mind.club auth\nnonce:${params.nonce}`,
    signature: params.signature,
    signingScheme: params.signingScheme,
    key: params.key,
    publicKey: params.publicKey
  });
}
