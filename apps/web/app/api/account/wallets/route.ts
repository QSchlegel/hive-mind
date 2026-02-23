import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const account = await requireAccountSession(request);

    const wallets = await query<{
      id: string;
      bot_id: string;
      wallet_chain: "evm" | "cardano" | "bitcoin";
      wallet_address: string;
      linked_at: string;
      xp_balance: number;
      credit_balance_micro_eur: string;
    }>(
      `select awl.id,
              awl.bot_id,
              awl.wallet_chain,
              awl.wallet_address,
              awl.linked_at::text,
              b.xp_balance::int,
              b.credit_balance_micro_eur::text
       from account_wallet_links awl
       join bots b on b.id = awl.bot_id
       where awl.account_id = $1
       order by awl.linked_at desc`,
      [account.accountId]
    );

    return jsonResponse({
      ok: true,
      wallets: wallets.rows.map((row) => ({
        id: row.id,
        bot_id: row.bot_id,
        wallet_chain: row.wallet_chain,
        wallet_address: row.wallet_address,
        linked_at: row.linked_at,
        xp_balance: row.xp_balance,
        credit_balance_micro_eur: Number(row.credit_balance_micro_eur),
        credit_balance_eur: Number(row.credit_balance_micro_eur) / 1_000_000
      }))
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not fetch linked wallets", 401);
  }
}
