import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireAdminTreasuryAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  transfer_reference: z.string().min(3).max(200),
  receipt_url: z.string().url().optional(),
  notes: z.string().max(2_000).optional()
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const admin = await requireAdminTreasuryAccess(request);
    const body = await parseJson(request, schema);
    const { id } = await params;

    const result = await withTransaction(async (client) => {
      const proposal = await client.query<{
        id: string;
        status: "open" | "approved" | "rejected" | "funded" | "cancelled";
        requested_micro_eur: string;
        treasury_account_id: string | null;
      }>(
        `select id, status, requested_micro_eur::text, treasury_account_id
         from treasury_proposals
         where id = $1
         for update`,
        [id]
      );

      if (!proposal.rowCount) {
        throw new Error("Treasury proposal not found");
      }

      const current = proposal.rows[0];
      if (current.status !== "approved") {
        throw new Error("Only approved proposals can be marked funded");
      }

      const treasuryAccount = current.treasury_account_id
        ? await client.query<{ id: string }>(
            `select id
             from treasury_accounts
             where id = $1
             limit 1`,
            [current.treasury_account_id]
          )
        : await client.query<{ id: string }>(
            `select id
             from treasury_accounts
             where status = 'active'
             order by updated_at desc
             limit 1`
          );

      if (!treasuryAccount.rowCount) {
        throw new Error("No treasury account available for payout");
      }

      const adminWallet = await client.query<{
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
      }>(
        `select wallet_chain, wallet_address
         from account_wallet_links
         where account_id = $1
         order by linked_at asc
         limit 1`,
        [admin.accountId]
      );

      const payout = await client.query<{
        id: string;
        funded_at: string;
        amount_micro_eur: string;
      }>(
        `insert into treasury_payouts (
           proposal_id,
           treasury_account_id,
           funded_by_account_id,
           funded_by_wallet_chain,
           funded_by_wallet_address,
           amount_micro_eur,
           transfer_reference,
           receipt_url,
           notes
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (proposal_id) do nothing
         returning id, funded_at::text, amount_micro_eur::text`,
        [
          id,
          treasuryAccount.rows[0].id,
          admin.accountId,
          adminWallet.rows[0]?.wallet_chain ?? null,
          adminWallet.rows[0]?.wallet_address ?? null,
          Number(current.requested_micro_eur),
          body.transfer_reference,
          body.receipt_url ?? null,
          body.notes ?? null
        ]
      );

      if (!payout.rowCount) {
        throw new Error("Proposal is already marked as funded");
      }

      await client.query(
        `update treasury_proposals
         set status = 'funded',
             executed_at = now(),
             updated_at = now()
         where id = $1`,
        [id]
      );

      return {
        payout_id: payout.rows[0].id,
        funded_at: payout.rows[0].funded_at,
        amount_micro_eur: Number(payout.rows[0].amount_micro_eur),
        amount_eur: Number(payout.rows[0].amount_micro_eur) / 1_000_000
      };
    });

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid treasury funding payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not mark proposal as funded", 400);
  }
}
