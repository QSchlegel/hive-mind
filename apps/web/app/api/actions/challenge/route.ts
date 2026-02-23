import { z } from "zod";
import { buildCanonicalPayload, buildNonce, hashCanonicalPayload, sha256Hex } from "@hive-mind/shared";
import { withTransaction } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { insertNonce } from "@/lib/nonces";
import { requireSession } from "@/lib/session";

const schema = z.object({
  action_type: z.enum([
    "create_note",
    "edit_note",
    "endorse_note",
    "create_treasury_proposal",
    "vote_treasury_proposal",
    "link_wallet"
  ]),
  note_id: z.string().uuid().nullable().optional(),
  proposal_id: z.string().uuid().nullable().optional(),
  content_md: z.string().nullable().optional(),
  changed_chars: z.number().int().nonnegative().nullable().optional(),
  endorse_xp: z.number().int().positive().nullable().optional(),
  vote_xp: z.number().int().positive().nullable().optional()
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, schema);

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const nonce = buildNonce("action");

    if ((body.action_type === "edit_note" || body.action_type === "endorse_note") && !body.note_id) {
      return errorResponse("note_id is required for edit/endorse challenges", 400);
    }

    if (body.action_type === "vote_treasury_proposal" && !body.proposal_id) {
      return errorResponse("proposal_id is required for vote challenges", 400);
    }

    if (body.action_type === "endorse_note" && !body.endorse_xp) {
      return errorResponse("endorse_xp is required for endorse challenges", 400);
    }

    if (body.action_type === "vote_treasury_proposal" && !body.vote_xp) {
      return errorResponse("vote_xp is required for treasury vote challenges", 400);
    }

    const actionNeedsContent =
      body.action_type === "create_note" ||
      body.action_type === "edit_note" ||
      body.action_type === "create_treasury_proposal";

    if (actionNeedsContent && !body.content_md) {
      return errorResponse("content_md is required for this action challenge", 400);
    }

    const changedChars =
      body.action_type === "endorse_note" ||
      body.action_type === "vote_treasury_proposal" ||
      body.action_type === "link_wallet"
        ? null
        : body.changed_chars ?? (body.content_md ? body.content_md.length : null);

    const payload = buildCanonicalPayload({
      action_type: body.action_type,
      bot_id: session.botId,
      chain: session.walletChain,
      wallet_address: session.walletAddress,
      note_id: body.note_id ?? null,
      proposal_id: body.proposal_id ?? null,
      content_sha256: body.content_md ? sha256Hex(body.content_md) : null,
      changed_chars: changedChars,
      endorse_xp: body.action_type === "endorse_note" ? body.endorse_xp ?? null : null,
      vote_xp: body.action_type === "vote_treasury_proposal" ? body.vote_xp ?? null : null,
      nonce,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    });

    await withTransaction(async (client) => {
      await insertNonce(client, {
        nonce,
        walletAddress: session.walletAddress,
        chain: session.walletChain,
        actionType: body.action_type,
        botId: session.botId,
        expiresAt: expiresAt.toISOString()
      });
    });

    return jsonResponse({
      payload,
      payload_hash: hashCanonicalPayload(payload)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid action challenge payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not issue action challenge", 401);
  }
}
