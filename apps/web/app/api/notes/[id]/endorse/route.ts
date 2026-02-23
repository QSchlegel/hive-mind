import { z } from "zod";
import {
  buildCanonicalPayload,
  computeCashbackMicroEur,
  DAILY_ENDORSE_XP_CAP,
  signatureEnvelopeSchema
} from "@hive-mind/shared";
import { verifyAndPersistActionSignature } from "@/lib/actions";
import { lockBot, resolveDailyEndorseSpent } from "@/lib/bot-balance";
import { withTransaction } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  xp_spent: z.number().int().positive(),
  signature: signatureEnvelopeSchema
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, schema);
    const { id } = await params;

    const result = await withTransaction(async (client) => {
      const endorserBot = await lockBot(client, session.botId);

      const noteResult = await client.query<{ id: string; author_bot_id: string }>(
        `select id, author_bot_id from notes where id = $1 for update`,
        [id]
      );

      if (!noteResult.rowCount) {
        throw new Error("Note not found");
      }

      const note = noteResult.rows[0];
      if (note.author_bot_id === session.botId) {
        throw new Error("Self endorsement is not allowed");
      }

      const dailySpent = resolveDailyEndorseSpent(endorserBot);
      if (dailySpent + body.xp_spent > DAILY_ENDORSE_XP_CAP) {
        throw new Error(`Daily endorsement cap exceeded (${DAILY_ENDORSE_XP_CAP} XP)`);
      }

      if (endorserBot.xp_balance < body.xp_spent) {
        throw new Error("Insufficient XP balance");
      }

      const payload = buildCanonicalPayload({
        action_type: "endorse_note",
        bot_id: session.botId,
        chain: session.walletChain,
        wallet_address: session.walletAddress,
        note_id: id,
        content_sha256: null,
        changed_chars: null,
        endorse_xp: body.xp_spent,
        nonce: body.signature.nonce,
        issued_at: body.signature.issued_at,
        expires_at: body.signature.expires_at
      });

      const { actionSignatureId } = await verifyAndPersistActionSignature({
        client,
        botId: session.botId,
        actionType: "endorse_note",
        payload,
        envelope: body.signature
      });

      const cashbackMicroEur = computeCashbackMicroEur(body.xp_spent);
      const nowDate = new Date().toISOString().slice(0, 10);
      const resetDate = new Date(endorserBot.daily_reset_at).toISOString().slice(0, 10);
      const nextDailySpent = (resetDate === nowDate ? endorserBot.daily_endorse_xp_spent : 0) + body.xp_spent;

      await client.query(
        `update bots
         set xp_balance = xp_balance - $2,
             daily_endorse_xp_spent = $3,
             daily_reset_at = now(),
             updated_at = now()
         where id = $1`,
        [session.botId, body.xp_spent, nextDailySpent]
      );

      await client.query(
        `update bots
         set credit_balance_micro_eur = credit_balance_micro_eur + $2,
             updated_at = now()
         where id = $1`,
        [note.author_bot_id, cashbackMicroEur]
      );

      const endorsement = await client.query<{ id: string }>(
        `insert into endorsements (note_id, endorser_bot_id, xp_spent, author_cashback_micro_eur, action_signature_id)
         values ($1,$2,$3,$4,$5)
         returning id`,
        [id, session.botId, body.xp_spent, cashbackMicroEur, actionSignatureId]
      );

      await client.query(
        `insert into ledger_entries (bot_id, entry_type, amount_micro_eur_signed, amount_xp_signed, reference_type, reference_id)
         values
           ($1,'endorse_spend',0,$2,'endorsement',$3),
           ($4,'endorse_cashback',$5,0,'endorsement',$3)`,
        [session.botId, -body.xp_spent, endorsement.rows[0].id, note.author_bot_id, cashbackMicroEur]
      );

      return {
        endorsement_id: endorsement.rows[0].id,
        cashback_micro_eur: cashbackMicroEur,
        xp_spent: body.xp_spent
      };
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid endorse payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to endorse", 400);
  }
}
