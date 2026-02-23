import type { PoolClient } from "pg";
import { canonicalPayloadSchema, type CanonicalActionPayload, type SignatureEnvelope } from "@hive-mind/shared";
import { lockActiveNonce, markNonceUsed } from "./nonces";
import { verifyActionSignature } from "./signature-verifier";

export async function verifyAndPersistActionSignature(params: {
  client: PoolClient;
  botId: string;
  actionType:
    | "create_note"
    | "edit_note"
    | "endorse_note"
    | "create_treasury_proposal"
    | "vote_treasury_proposal"
    | "link_wallet";
  payload: CanonicalActionPayload;
  envelope: SignatureEnvelope;
}): Promise<{ actionSignatureId: string }> {
  const payload = canonicalPayloadSchema.parse(params.payload);

  if (payload.action_type !== params.actionType) {
    throw new Error("Action type mismatch");
  }

  const signatureCheck = await verifyActionSignature(payload, params.envelope);
  if (!signatureCheck.ok) {
    throw new Error(signatureCheck.reason ?? "Invalid action signature");
  }

  const nonce = await lockActiveNonce(params.client, {
    nonce: params.envelope.nonce,
    walletAddress: params.envelope.wallet_address,
    chain: params.envelope.chain,
    actionType: params.actionType,
    botId: params.botId
  });

  if (!nonce) {
    throw new Error("Challenge nonce not found");
  }

  if (nonce.used_at) {
    throw new Error("Challenge nonce already consumed");
  }

  if (Date.parse(nonce.expires_at) < Date.now()) {
    throw new Error("Challenge nonce expired");
  }

  await markNonceUsed(params.client, nonce.id);

  const inserted = await params.client.query<{ id: string }>(
    `insert into action_signatures (
      bot_id,
      action_type,
      chain,
      wallet_address,
      signing_scheme,
      payload_hash,
      signature_bytes,
      public_key,
      key,
      nonce_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    returning id`,
    [
      params.botId,
      params.actionType,
      params.envelope.chain,
      params.envelope.wallet_address,
      params.envelope.signing_scheme,
      params.envelope.payload_hash,
      params.envelope.signature_bytes,
      params.envelope.public_key ?? null,
      params.envelope.key ?? null,
      nonce.id
    ]
  );

  return { actionSignatureId: inserted.rows[0].id };
}
