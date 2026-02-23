import { computeTreasuryOutcome } from "@hive-mind/shared";
import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;

    const proposalResult = await query<{
      id: string;
      title: string;
      summary: string | null;
      description_md: string;
      requested_micro_eur: string;
      status: "open" | "approved" | "rejected" | "funded" | "cancelled";
      vote_quorum_xp: string;
      yes_xp: string;
      no_xp: string;
      voting_deadline: string;
      created_at: string;
      updated_at: string;
      proposer_account_id: string | null;
      proposer_email: string | null;
      proposer_name: string | null;
      proposer_bot_id: string | null;
      proposer_wallet_chain: "evm" | "cardano" | "bitcoin" | null;
      proposer_wallet_address: string | null;
      treasury_provider: "stripe" | "cross_chain" | null;
      payout_transfer_reference: string | null;
      payout_receipt_url: string | null;
      payout_notes: string | null;
      payout_funded_at: string | null;
      payout_funded_by_account_id: string | null;
    }>(
      `select tp.id,
              tp.title,
              tp.summary,
              tp.description_md,
              tp.requested_micro_eur::text,
              tp.status,
              tp.vote_quorum_xp::text,
              tp.yes_xp::text,
              tp.no_xp::text,
              tp.voting_deadline::text,
              tp.created_at::text,
              tp.updated_at::text,
              tp.proposer_account_id,
              u.email as proposer_email,
              u.name as proposer_name,
              tp.proposer_bot_id,
              b.wallet_chain as proposer_wallet_chain,
              b.wallet_address as proposer_wallet_address,
              ta.provider as treasury_provider,
              po.transfer_reference as payout_transfer_reference,
              po.receipt_url as payout_receipt_url,
              po.notes as payout_notes,
              po.funded_at::text as payout_funded_at,
              po.funded_by_account_id as payout_funded_by_account_id
       from treasury_proposals tp
       left join "user" u on u.id = tp.proposer_account_id
       left join bots b on b.id = tp.proposer_bot_id
       left join treasury_accounts ta on ta.id = tp.treasury_account_id
       left join treasury_payouts po on po.proposal_id = tp.id
       where tp.id = $1
       limit 1`,
      [id]
    );

    if (!proposalResult.rowCount) {
      return errorResponse("Treasury proposal not found", 404);
    }

    const votesResult = await query<{
      id: string;
      vote: "yes" | "no";
      xp_spent: number;
      created_at: string;
      voter_account_id: string | null;
      voter_email: string | null;
      voter_name: string | null;
      source_bot_id: string | null;
      wallet_chain: "evm" | "cardano" | "bitcoin" | null;
      wallet_address: string | null;
    }>(
      `select tv.id,
              tv.vote,
              tv.xp_spent,
              tv.created_at::text,
              tv.voter_account_id,
              u.email as voter_email,
              u.name as voter_name,
              tv.source_bot_id,
              b.wallet_chain,
              b.wallet_address
       from treasury_votes tv
       left join "user" u on u.id = tv.voter_account_id
       left join bots b on b.id = tv.source_bot_id
       where tv.proposal_id = $1
       order by tv.created_at desc
       limit 200`,
      [id]
    );

    const proposal = proposalResult.rows[0];
    const yesXp = Number(proposal.yes_xp);
    const noXp = Number(proposal.no_xp);
    const quorumXp = Number(proposal.vote_quorum_xp);
    const outcome = computeTreasuryOutcome({ yesXp, noXp, quorumXp });
    const votingDeadlineTs = Date.parse(proposal.voting_deadline);
    const votingExpired = Number.isFinite(votingDeadlineTs) && votingDeadlineTs <= Date.now();

    return jsonResponse({
      ok: true,
      proposal: {
        id: proposal.id,
        title: proposal.title,
        summary: proposal.summary,
        description_md: proposal.description_md,
        requested_micro_eur: Number(proposal.requested_micro_eur),
        requested_eur: Number(proposal.requested_micro_eur) / 1_000_000,
        status: proposal.status,
        vote_quorum_xp: quorumXp,
        yes_xp: yesXp,
        no_xp: noXp,
        total_voted_xp: outcome.totalXp,
        quorum_reached: outcome.quorumReached,
        passing: outcome.approved,
        voting_deadline: proposal.voting_deadline,
        voting_expired: votingExpired,
        proposer: {
          account_id: proposal.proposer_account_id,
          email: proposal.proposer_email,
          name: proposal.proposer_name,
          bot_id: proposal.proposer_bot_id,
          wallet_chain: proposal.proposer_wallet_chain,
          wallet_address: proposal.proposer_wallet_address
        },
        custody_provider: proposal.treasury_provider,
        payout: proposal.payout_transfer_reference
          ? {
              transfer_reference: proposal.payout_transfer_reference,
              receipt_url: proposal.payout_receipt_url,
              notes: proposal.payout_notes,
              funded_at: proposal.payout_funded_at,
              funded_by_account_id: proposal.payout_funded_by_account_id
            }
          : null,
        created_at: proposal.created_at,
        updated_at: proposal.updated_at
      },
      votes: votesResult.rows
    });
  } catch {
    return errorResponse("Could not fetch treasury proposal", 500);
  }
}
