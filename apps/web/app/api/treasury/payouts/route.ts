import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import { requireAdminTreasuryAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminTreasuryAccess(request);

    const payouts = await query<{
      id: string;
      proposal_id: string;
      treasury_account_id: string;
      funded_by_account_id: string;
      funded_by_email: string | null;
      funded_by_name: string | null;
      funded_by_wallet_chain: "evm" | "cardano" | "bitcoin" | null;
      funded_by_wallet_address: string | null;
      amount_micro_eur: string;
      transfer_reference: string;
      receipt_url: string | null;
      notes: string | null;
      funded_at: string;
      created_at: string;
      proposal_title: string | null;
    }>(
      `select p.id,
              p.proposal_id,
              p.treasury_account_id,
              p.funded_by_account_id,
              u.email as funded_by_email,
              u.name as funded_by_name,
              p.funded_by_wallet_chain,
              p.funded_by_wallet_address,
              p.amount_micro_eur::text,
              p.transfer_reference,
              p.receipt_url,
              p.notes,
              p.funded_at::text,
              p.created_at::text,
              tp.title as proposal_title
       from treasury_payouts p
       left join \"user\" u on u.id = p.funded_by_account_id
       left join treasury_proposals tp on tp.id = p.proposal_id
       order by p.created_at desc
       limit 500`
    );

    return jsonResponse({
      ok: true,
      payouts: payouts.rows.map((row) => ({
        id: row.id,
        proposal_id: row.proposal_id,
        proposal_title: row.proposal_title,
        treasury_account_id: row.treasury_account_id,
        funded_by_account_id: row.funded_by_account_id,
        funded_by_email: row.funded_by_email,
        funded_by_name: row.funded_by_name,
        funded_by_wallet_chain: row.funded_by_wallet_chain,
        funded_by_wallet_address: row.funded_by_wallet_address,
        amount_micro_eur: Number(row.amount_micro_eur),
        amount_eur: Number(row.amount_micro_eur) / 1_000_000,
        transfer_reference: row.transfer_reference,
        receipt_url: row.receipt_url,
        notes: row.notes,
        funded_at: row.funded_at,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not fetch treasury payouts", 403);
  }
}
