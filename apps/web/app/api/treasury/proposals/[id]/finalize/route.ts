import { computeTreasuryOutcome } from "@hive-mind/shared";
import { withTransaction } from "@/lib/db";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse } from "@/lib/http";
import { requireAdminTreasuryAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    await requireAdminTreasuryAccess(request);
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
        throw new Error(`Proposal already finalized with status ${proposal.status}`);
      }

      if (Date.parse(proposal.voting_deadline) > Date.now()) {
        throw new Error("Voting window is still active");
      }

      const outcome = computeTreasuryOutcome({
        yesXp: proposal.yes_xp,
        noXp: proposal.no_xp,
        quorumXp: proposal.vote_quorum_xp
      });

      const nextStatus = outcome.approved ? "approved" : "rejected";

      await client.query(
        `update treasury_proposals
         set status = $2,
             updated_at = now()
         where id = $1`,
        [id, nextStatus]
      );

      return {
        proposal_id: id,
        status: nextStatus,
        yes_xp: proposal.yes_xp,
        no_xp: proposal.no_xp,
        vote_quorum_xp: proposal.vote_quorum_xp,
        total_voted_xp: outcome.totalXp,
        quorum_reached: outcome.quorumReached,
        approved: outcome.approved
      };
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not finalize treasury proposal", 400);
  }
}
