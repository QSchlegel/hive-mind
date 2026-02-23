import { z } from "zod";
import { sha256Hex } from "@hive-mind/shared";
import { withTransaction } from "@/lib/db";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { lockActiveNonce, markNonceUsed } from "@/lib/nonces";
import { requireAccountSession } from "@/lib/session";
import { verifyWalletMessageSignature } from "@/lib/signature-verifier";

export const dynamic = "force-dynamic";

const schema = z.object({
  wallet_address: z.string().min(4),
  chain: z.enum(["evm", "cardano", "bitcoin"]),
  nonce: z.string().min(10),
  signature: z.string().min(8),
  signing_scheme: z.enum(["eip712", "cip8", "bip322"]),
  key: z.string().optional(),
  public_key: z.string().optional()
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const account = await requireAccountSession(request);
    const body = await parseJson(request, schema);
    const message = `hive-mind.club link wallet\nnonce:${body.nonce}\naccount:${account.accountId}`;

    const result = await withTransaction(async (client) => {
      const nonce = await lockActiveNonce(client, {
        nonce: body.nonce,
        walletAddress: body.wallet_address,
        chain: body.chain,
        actionType: "link_wallet"
      });

      if (!nonce) {
        throw new Error("Wallet link challenge not found");
      }

      if (nonce.used_at) {
        throw new Error("Wallet link challenge already used");
      }

      if (Date.parse(nonce.expires_at) < Date.now()) {
        throw new Error("Wallet link challenge expired");
      }

      const signatureCheck = await verifyWalletMessageSignature({
        chain: body.chain,
        walletAddress: body.wallet_address,
        message,
        signature: body.signature,
        signingScheme: body.signing_scheme,
        key: body.key,
        publicKey: body.public_key
      });

      if (!signatureCheck.ok) {
        throw new Error(signatureCheck.reason ?? "Invalid wallet signature");
      }

      const existingWallet = await client.query<{ account_id: string }>(
        `select account_id
         from account_wallet_links
         where wallet_chain = $1
           and wallet_address = $2
         limit 1
         for update`,
        [body.chain, body.wallet_address]
      );

      if (existingWallet.rowCount && existingWallet.rows[0].account_id !== account.accountId) {
        throw new Error("Wallet is already linked to another account");
      }

      const bot = await client.query<{
        id: string;
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
      }>(
        `insert into bots (wallet_chain, wallet_address)
         values ($1, $2)
         on conflict (wallet_chain, wallet_address)
         do update set updated_at = now()
         returning id, wallet_chain, wallet_address`,
        [body.chain, body.wallet_address]
      );

      const linked = await client.query<{ id: string; bot_id: string; linked_at: string }>(
        `insert into account_wallet_links (account_id, wallet_chain, wallet_address, bot_id)
         values ($1, $2, $3, $4)
         on conflict (wallet_chain, wallet_address) do update
         set bot_id = excluded.bot_id,
             linked_at = now()
         where account_wallet_links.account_id = excluded.account_id
         returning id, bot_id, linked_at::text`,
        [account.accountId, body.chain, body.wallet_address, bot.rows[0].id]
      );

      if (!linked.rowCount) {
        throw new Error("Wallet is already linked to another account");
      }

      await markNonceUsed(client, nonce.id);

      await client.query(
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
        ) values ($1,'link_wallet',$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          bot.rows[0].id,
          body.chain,
          body.wallet_address,
          body.signing_scheme,
          sha256Hex(message),
          body.signature,
          body.public_key ?? null,
          body.key ?? null,
          nonce.id
        ]
      );

      return {
        link_id: linked.rows[0].id,
        bot_id: bot.rows[0].id,
        wallet_chain: bot.rows[0].wallet_chain,
        wallet_address: bot.rows[0].wallet_address,
        linked_at: linked.rows[0].linked_at
      };
    });

    return jsonResponse({
      ok: true,
      ...result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid wallet link verification payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Wallet link verification failed", 400);
  }
}
