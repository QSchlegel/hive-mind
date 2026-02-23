import { z } from "zod";
import { buildCanonicalPayload, computeTreasuryOutcome, signatureEnvelopeSchema } from "@hive-mind/shared";
import { verifyAndPersistActionSignature } from "@/lib/actions";
import { withTransaction } from "@/lib/db";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const voteSchema = z.object({
  vote: z.enum(["yes", "no"]),
  xp_spent: z.number().int().positive().max(1_000_000),
  source_bot_id: z.string().uuid(),
  signature: signatureEnvelopeSchema.optional()
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const accountSession = await requireAccountSession(request);
    const body = await parseJson(request, voteSchema);
    const { id } = await params;

    const result = await withTransaction(async (client) => {
      const proposalResult = await client.query<{
        id: string;
        status: "open" | "approved" | "rejected" | "funded" | "cancelled";
        vote_quorum_xp: number;
        yes_xp: number;
        no_xp: number;
        voting_deadline: string;
      }>(
        `select id,
                status,
                vote_quorum_xp,
                yes_xp,
                no_xp,
                voting_deadline::text
         from treasury_proposals
         where id = $1
         for update`,
        [id]
      );

      if (!proposalResult.rowCount) {
        throw new Error("Treasury proposal not found");
      }

      const proposal = proposalResult.rows[0];
      if (proposal.status !== "open") {
        throw new Error(`Proposal is ${proposal.status} and no longer accepting votes`);
      }

      if (Date.parse(proposal.voting_deadline) <= Date.now()) {
        throw new Error("Voting window has closed for this proposal");
      }

      const existingVote = await client.query<{ id: string }>(
        `select id
         from treasury_votes
         where proposal_id = $1 and voter_account_id = $2
         limit 1`,
        [id, accountSession.accountId]
      );

      if (existingVote.rowCount) {
        throw new Error("This account has already voted on this proposal");
      }

      const sourceBotResult = await client.query<{
        bot_id: string;
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
        xp_balance: number;
      }>(
        `select awl.bot_id,
                b.wallet_chain,
                b.wallet_address,
                b.xp_balance::int
         from account_wallet_links awl
         join bots b on b.id = awl.bot_id
         where awl.account_id = $1
           and awl.bot_id = $2
         limit 1
         for update`,
        [accountSession.accountId, body.source_bot_id]
      );

      if (!sourceBotResult.rowCount) {
        throw new Error("source_bot_id is not linked to this account");
      }

      const sourceBot = sourceBotResult.rows[0];
      if (sourceBot.xp_balance < body.xp_spent) {
        throw new Error("Insufficient XP balance on selected bot");
      }

      let actionSignatureId: string | null = null;
      if (body.signature) {
        const payload = buildCanonicalPayload({
          action_type: "vote_treasury_proposal",
          bot_id: sourceBot.bot_id,
          chain: sourceBot.wallet_chain,
          wallet_address: sourceBot.wallet_address,
          note_id: null,
          proposal_id: id,
          content_sha256: null,
          changed_chars: null,
          endorse_xp: null,
          vote_xp: body.xp_spent,
          nonce: body.signature.nonce,
          issued_at: body.signature.issued_at,
          expires_at: body.signature.expires_at
        });

        const signature = await verifyAndPersistActionSignature({
          client,
          botId: sourceBot.bot_id,
          actionType: "vote_treasury_proposal",
          payload,
          envelope: body.signature
        });

        actionSignatureId = signature.actionSignatureId;
      }

      const voteInsert = await client.query<{ id: string }>(
        `insert into treasury_votes (
           proposal_id,
           voter_bot_id,
           source_bot_id,
           voter_account_id,
           vote,
           xp_spent,
           action_signature_id
         )
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id`,
        [id, sourceBot.bot_id, sourceBot.bot_id, accountSession.accountId, body.vote, body.xp_spent, actionSignatureId]
      );

      if (body.vote === "yes") {
        await client.query(
          `update treasury_proposals
           set yes_xp = yes_xp + $2,
               updated_at = now()
           where id = $1`,
          [id, body.xp_spent]
        );
      } else {
        await client.query(
          `update treasury_proposals
           set no_xp = no_xp + $2,
               updated_at = now()
           where id = $1`,
          [id, body.xp_spent]
        );
      }

      await client.query(
        `update bots
         set xp_balance = xp_balance - $2,
             updated_at = now()
         where id = $1`,
        [sourceBot.bot_id, body.xp_spent]
      );

      await client.query(
        `insert into ledger_entries (bot_id, entry_type, amount_micro_eur_signed, amount_xp_signed, reference_type, reference_id)
         values ($1,'treasury_vote_spend',0,$2,'treasury_vote',$3)`,
        [sourceBot.bot_id, -body.xp_spent, voteInsert.rows[0].id]
      );

      const nextYesXp = proposal.yes_xp + (body.vote === "yes" ? body.xp_spent : 0);
      const nextNoXp = proposal.no_xp + (body.vote === "no" ? body.xp_spent : 0);
      const outcome = computeTreasuryOutcome({
        yesXp: nextYesXp,
        noXp: nextNoXp,
        quorumXp: proposal.vote_quorum_xp
      });

      return {
        vote_id: voteInsert.rows[0].id,
        vote: body.vote,
        xp_spent: body.xp_spent,
        source_bot_id: sourceBot.bot_id,
        voter_account_id: accountSession.accountId,
        yes_xp: nextYesXp,
        no_xp: nextNoXp,
        vote_quorum_xp: proposal.vote_quorum_xp,
        total_voted_xp: outcome.totalXp,
        quorum_reached: outcome.quorumReached,
        passing: outcome.approved
      };
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid treasury vote payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not cast treasury vote", 400);
  }
}
