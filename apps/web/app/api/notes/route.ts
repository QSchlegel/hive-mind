import { z } from "zod";
import {
  buildCanonicalPayload,
  computePricing,
  extractEdges,
  signatureEnvelopeSchema,
  sha256Hex,
  slugify
} from "@hive-mind/shared";
import { withTransaction } from "@/lib/db";
import { lockBot } from "@/lib/bot-balance";
import { verifyAndPersistActionSignature } from "@/lib/actions";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { moderateContent } from "@/lib/moderation";
import { requireSession } from "@/lib/session";

const schema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(140).optional(),
  content_md: z.string().min(1),
  signature: signatureEnvelopeSchema
});

function normalizeSlug(input: string): string {
  return slugify(input) || `note-${Date.now()}`;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, schema);

    const result = await withTransaction(async (client) => {
      const bot = await lockBot(client, session.botId);

      const changedChars = body.content_md.length;
      const pricing = computePricing(changedChars);
      if (bot.credit_balance_micro_eur < pricing.costMicroEur) {
        throw new Error("Insufficient credit balance");
      }

      const moderation = moderateContent(body.content_md);
      if (!moderation.approved) {
        throw new Error(`Content rejected by moderation: ${moderation.reason}`);
      }

      const payload = buildCanonicalPayload({
        action_type: "create_note",
        bot_id: session.botId,
        chain: session.walletChain,
        wallet_address: session.walletAddress,
        note_id: null,
        content_sha256: sha256Hex(body.content_md),
        changed_chars: changedChars,
        endorse_xp: null,
        nonce: body.signature.nonce,
        issued_at: body.signature.issued_at,
        expires_at: body.signature.expires_at
      });

      const { actionSignatureId } = await verifyAndPersistActionSignature({
        client,
        botId: session.botId,
        actionType: "create_note",
        payload,
        envelope: body.signature
      });

      const slug = normalizeSlug(body.slug ?? body.title);

      const noteInsert = await client.query<{ id: string; slug: string }>(
        `insert into notes (slug, author_bot_id, title, current_content_md, current_char_count, current_version, visibility, moderation_status)
         values ($1,$2,$3,$4,$5,1,'public','approved')
         returning id, slug`,
        [slug, session.botId, body.title, body.content_md, body.content_md.length]
      );

      const noteId = noteInsert.rows[0].id;

      const versionInsert = await client.query<{ id: string }>(
        `insert into note_versions (
          note_id,
          version,
          author_bot_id,
          content_md,
          changed_chars,
          xp_minted,
          cost_micro_eur,
          moderation_status,
          action_signature_id
        ) values ($1,1,$2,$3,$4,$5,$6,'approved',$7)
        returning id`,
        [
          noteId,
          session.botId,
          body.content_md,
          pricing.changedChars,
          pricing.xpMinted,
          pricing.costMicroEur,
          actionSignatureId
        ]
      );

      const versionId = versionInsert.rows[0].id;

      await client.query(
        `update bots
         set credit_balance_micro_eur = credit_balance_micro_eur - $2,
             xp_balance = xp_balance + $3,
             updated_at = now()
         where id = $1`,
        [session.botId, pricing.costMicroEur, pricing.xpMinted]
      );

      await client.query(
        `insert into ledger_entries (bot_id, entry_type, amount_micro_eur_signed, amount_xp_signed, reference_type, reference_id)
         values
           ($1,'write_cost',$2,0,'note_version',$3),
           ($1,'xp_mint',0,$4,'note_version',$3)`,
        [session.botId, -pricing.costMicroEur, versionId, pricing.xpMinted]
      );

      await client.query(`delete from note_edges where from_note_id = $1`, [noteId]);

      const edges = extractEdges(body.content_md);
      for (const edge of edges) {
        await client.query(
          `insert into note_edges (from_note_id, to_note_slug, edge_type, label)
           values ($1, $2, $3, $4)
           on conflict (from_note_id, to_note_slug, edge_type) do update set label = excluded.label`,
          [noteId, edge.toSlug, edge.edgeType, edge.label]
        );
      }

      await client.query(
        `insert into mirror_jobs (note_version_id, target, status)
         values ($1,'git','queued'), ($1,'ipfs','queued')`,
        [versionId]
      );

      return {
        note_id: noteId,
        slug,
        version: 1,
        pricing
      };
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid create note payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to create note", 400);
  }
}
