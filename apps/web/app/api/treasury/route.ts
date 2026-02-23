import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const account = await query<{
      id: string;
      provider: "stripe" | "cross_chain";
      status: "active" | "migrating" | "inactive";
      currency: string;
      external_account_ref: string | null;
      network: string | null;
      balance_micro_eur: string;
      created_at: string;
      updated_at: string;
    }>(
      `select id,
              provider,
              status,
              currency,
              external_account_ref,
              network,
              balance_micro_eur::text,
              created_at::text,
              updated_at::text
       from treasury_accounts
       where status = 'active'
       order by updated_at desc
       limit 1`
    );

    if (!account.rowCount) {
      return errorResponse("No active treasury account configured", 500);
    }

    const contributionStats = await query<{
      total_confirmed_micro_eur: string;
      confirmed_contributions: number;
      unique_contributor_accounts: number;
    }>(
      `select coalesce(sum(amount_micro_eur), 0)::text as total_confirmed_micro_eur,
              count(*)::int as confirmed_contributions,
              count(distinct contributor_account_id)::int as unique_contributor_accounts
       from treasury_contributions
       where status = 'confirmed'`
    );

    const proposalStats = await query<{
      open_count: number;
      open_expired_count: number;
      approved_count: number;
      rejected_count: number;
      funded_count: number;
      reserved_micro_eur: string;
      total_voted_xp: string;
    }>(
      `select count(*) filter (where status = 'open' and voting_deadline > now())::int as open_count,
              count(*) filter (where status = 'open' and voting_deadline <= now())::int as open_expired_count,
              count(*) filter (where status = 'approved')::int as approved_count,
              count(*) filter (where status = 'rejected')::int as rejected_count,
              count(*) filter (where status = 'funded')::int as funded_count,
              coalesce(sum(case when status in ('approved', 'funded') then requested_micro_eur else 0 end), 0)::text as reserved_micro_eur,
              coalesce(sum(yes_xp + no_xp), 0)::text as total_voted_xp
       from treasury_proposals`
    );

    const payoutStats = await query<{
      payout_count: number;
      total_payout_micro_eur: string;
    }>(
      `select count(*)::int as payout_count,
              coalesce(sum(amount_micro_eur), 0)::text as total_payout_micro_eur
       from treasury_payouts`
    );

    const active = account.rows[0];
    const contribution = contributionStats.rows[0];
    const proposals = proposalStats.rows[0];
    const payouts = payoutStats.rows[0];
    const balanceMicroEur = Number(active.balance_micro_eur);
    const reservedMicroEur = Number(proposals.reserved_micro_eur);

    return jsonResponse({
      ok: true,
      treasury: {
        account: {
          id: active.id,
          provider: active.provider,
          status: active.status,
          currency: active.currency,
          external_account_ref: active.external_account_ref,
          network: active.network,
          balance_micro_eur: balanceMicroEur,
          balance_eur: balanceMicroEur / 1_000_000,
          created_at: active.created_at,
          updated_at: active.updated_at
        },
        contributions: {
          confirmed_count: contribution.confirmed_contributions,
          unique_contributor_accounts: contribution.unique_contributor_accounts,
          confirmed_micro_eur: Number(contribution.total_confirmed_micro_eur),
          confirmed_eur: Number(contribution.total_confirmed_micro_eur) / 1_000_000
        },
        proposals: {
          open_count: proposals.open_count,
          open_expired_count: proposals.open_expired_count,
          approved_count: proposals.approved_count,
          rejected_count: proposals.rejected_count,
          funded_count: proposals.funded_count,
          reserved_micro_eur: reservedMicroEur,
          reserved_eur: reservedMicroEur / 1_000_000,
          total_voted_xp: Number(proposals.total_voted_xp)
        },
        payouts: {
          count: payouts.payout_count,
          total_micro_eur: Number(payouts.total_payout_micro_eur),
          total_eur: Number(payouts.total_payout_micro_eur) / 1_000_000
        },
        available_micro_eur: Math.max(balanceMicroEur - reservedMicroEur, 0),
        available_eur: Math.max(balanceMicroEur - reservedMicroEur, 0) / 1_000_000
      }
    });
  } catch {
    return errorResponse("Could not fetch treasury status", 500);
  }
}
