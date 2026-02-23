import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { CanonicalActionPayload } from "./types";

export const DEFAULT_DOMAIN = "hive-mind.club";

export const canonicalPayloadSchema = z.object({
  version: z.literal("hm_action_v1"),
  domain: z.string().min(1),
  action_type: z.enum([
    "create_note",
    "edit_note",
    "endorse_note",
    "create_treasury_proposal",
    "vote_treasury_proposal",
    "auth_login",
    "link_wallet"
  ]),
  bot_id: z.string().uuid(),
  chain: z.enum(["evm", "cardano", "bitcoin"]),
  wallet_address: z.string().min(4),
  note_id: z.string().uuid().nullable(),
  proposal_id: z.string().uuid().nullable(),
  content_sha256: z.string().length(64).nullable(),
  changed_chars: z.number().int().nonnegative().nullable(),
  endorse_xp: z.number().int().nonnegative().nullable(),
  vote_xp: z.number().int().nonnegative().nullable(),
  nonce: z.string().min(10),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime()
});

export const signatureEnvelopeSchema = z.object({
  chain: z.enum(["evm", "cardano", "bitcoin"]),
  wallet_address: z.string().min(4),
  nonce: z.string().min(10),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  payload_hash: z.string().length(64),
  signature_bytes: z.string().min(8),
  signing_scheme: z.enum(["eip712", "cip8", "bip322"]),
  public_key: z.string().optional(),
  key: z.string().optional()
});

export function buildNonce(prefix = "hm"): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

type BuildCanonicalPayloadInput = Omit<
  CanonicalActionPayload,
  "version" | "domain" | "proposal_id" | "vote_xp"
> & {
  domain?: string;
  proposal_id?: string | null;
  vote_xp?: number | null;
};

export function buildCanonicalPayload(input: BuildCanonicalPayloadInput): CanonicalActionPayload {
  const payload: CanonicalActionPayload = {
    version: "hm_action_v1",
    domain: input.domain ?? DEFAULT_DOMAIN,
    action_type: input.action_type,
    bot_id: input.bot_id,
    chain: input.chain,
    wallet_address: input.wallet_address,
    note_id: input.note_id,
    proposal_id: input.proposal_id ?? null,
    content_sha256: input.content_sha256,
    changed_chars: input.changed_chars,
    endorse_xp: input.endorse_xp,
    vote_xp: input.vote_xp ?? null,
    nonce: input.nonce,
    issued_at: input.issued_at,
    expires_at: input.expires_at
  };

  return canonicalPayloadSchema.parse(payload);
}

export function canonicalizePayload(payload: CanonicalActionPayload): string {
  const parsed = canonicalPayloadSchema.parse(payload);
  return JSON.stringify(parsed);
}

export function hashCanonicalPayload(payload: CanonicalActionPayload): string {
  return createHash("sha256").update(canonicalizePayload(payload)).digest("hex");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
