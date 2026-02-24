import { z } from "zod";
import {
  buildCanonicalPayload,
  computeChangedChars,
  computePricing,
  extractEdges,
  signatureEnvelopeSchema,
  sha256Hex,
} from "@hive-mind/shared";
import { verifyAndPersistActionSignature } from "@/lib/actions";
import { lockBot } from "@/lib/bot-balance";
import { withTransaction } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { moderateContent } from "@/lib/moderation";
import { enqueueNoteCallbackIfConfigured, processCallbackJobById } from "@/lib/note-callbacks";
import { requireSession } from "@/lib/session";

const patchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  content_md: z.string().min(1),
  signature: signatureEnvelopeSchema
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, patchSchema);
    const { id } = await params;

    const result = await withTransaction(async (client) => {
      const noteResult = await client.query<{
        id: string;
        slug: string;
        author_bot_id: string;
        title: string;
        current_content_md: string;
        current_version: number;
      }>(
        `select id, slug, author_bot_id, title, current_content_md, current_version
         from notes where id = $1
         for update`,
        [id]
      );

      if (!noteResult.rowCount) {
        throw new Error("Note not found");
      }

      const note = noteResult.rows[0];
      if (note.author_bot_id !== session.botId) {
        throw new Error("Only the author bot can edit this note");
      }
      const nextTitle = body.title ?? note.title;

      const bot = await lockBot(client, session.botId);
      const changedChars = computeChangedChars(note.current_content_md, body.content_md);
      const pricing = computePricing(changedChars);

      if (bot.credit_balance_micro_eur < pricing.costMicroEur) {
        throw new Error("Insufficient credit balance");
      }

      const moderation = moderateContent(body.content_md);
      if (!moderation.approved) {
        throw new Error(`Content rejected by moderation: ${moderation.reason}`);
      }

      const payload = buildCanonicalPayload({
        action_type: "edit_note",
        bot_id: session.botId,
        chain: session.walletChain,
        wallet_address: session.walletAddress,
        note_id: id,
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
        actionType: "edit_note",
        payload,
        envelope: body.signature
      });

      const nextVersion = note.current_version + 1;

      await client.query(
        `update notes
         set title = $2,
             current_content_md = $3,
             current_char_count = $4,
             current_version = $5,
             moderation_status = 'approved'
         where id = $1`,
        [id, nextTitle, body.content_md, body.content_md.length, nextVersion]
      );

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
        ) values ($1,$2,$3,$4,$5,$6,$7,'approved',$8)
        returning id`,
        [
          id,
          nextVersion,
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
           ($1,'edit_cost',$2,0,'note_version',$3),
           ($1,'xp_mint',0,$4,'note_version',$3)`,
        [session.botId, -pricing.costMicroEur, versionId, pricing.xpMinted]
      );

      await client.query(`delete from note_edges where from_note_id = $1`, [id]);
      const edges = extractEdges(body.content_md);
      for (const edge of edges) {
        await client.query(
          `insert into note_edges (from_note_id, to_note_slug, edge_type, label)
           values ($1, $2, $3, $4)
           on conflict (from_note_id, to_note_slug, edge_type) do update set label = excluded.label`,
          [id, edge.toSlug, edge.edgeType, edge.label]
        );
      }

      await client.query(
        `insert into mirror_jobs (note_version_id, target, status)
         values ($1,'git','queued'), ($1,'ipfs','queued')`,
        [versionId]
      );

      const callbackJobId = await enqueueNoteCallbackIfConfigured({
        client,
        botId: session.botId,
        noteId: id,
        noteVersionId: versionId,
        event: "note.edited",
        payload: {
          source: "hive-mind",
          event: "note.edited",
          triggered_at: new Date().toISOString(),
          bot_id: session.botId,
          note: {
            id,
            slug: note.slug,
            title: nextTitle,
            version: nextVersion,
            content_md: body.content_md
          },
          metrics: {
            changed_chars: pricing.changedChars,
            xp_minted: pricing.xpMinted,
            cost_micro_eur: pricing.costMicroEur,
            social_callbacks: 1
          }
        }
      });

      return {
        note_id: id,
        version: nextVersion,
        changed_chars: changedChars,
        pricing,
        callback_job_id: callbackJobId
      };
    });

    const { callback_job_id, ...payload } = result;
    if (callback_job_id) {
      await processCallbackJobById(callback_job_id).catch(() => undefined);
    }

    return jsonResponse({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid edit note payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to edit note", 400);
  }
}
