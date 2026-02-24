import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import { ACTIVE_BOT_COOKIE, requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function parseActiveBotCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACTIVE_BOT_COOKIE}=`));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice(ACTIVE_BOT_COOKIE.length + 1));
}

export async function GET(request: Request): Promise<Response> {
  try {
    const account = await requireAccountSession(request);
    const activeBotId = parseActiveBotCookie(request);

    const wallets = await query<{
      bot_id: string;
      wallet_chain: "evm" | "cardano" | "bitcoin";
      wallet_address: string;
      display_label: string | null;
      xp_balance: number;
      credit_balance_micro_eur: string;
      linked_at: string;
    }>(
      `select awl.bot_id,
              awl.wallet_chain,
              awl.wallet_address,
              awl.display_label,
              b.xp_balance::int,
              b.credit_balance_micro_eur::text,
              awl.linked_at::text
       from account_wallet_links awl
       join bots b on b.id = awl.bot_id
       where awl.account_id = $1
       order by awl.linked_at asc`,
      [account.accountId]
    );

    const totalXp = wallets.rows.reduce((acc, row) => acc + row.xp_balance, 0);
    const totalCreditMicro = wallets.rows.reduce((acc, row) => acc + Number(row.credit_balance_micro_eur), 0);
    const active =
      (activeBotId ? wallets.rows.find((row) => row.bot_id === activeBotId) : null) ??
      wallets.rows[0] ??
      null;

    return jsonResponse({
      ok: true,
      account: {
        id: account.accountId,
        email: account.email,
        name: account.name
      },
      linked_wallets: wallets.rows.map((row) => ({
        bot_id: row.bot_id,
        wallet_chain: row.wallet_chain,
        wallet_address: row.wallet_address,
        display_label: row.display_label ?? null,
        xp_balance: row.xp_balance,
        credit_balance_micro_eur: Number(row.credit_balance_micro_eur),
        credit_balance_eur: Number(row.credit_balance_micro_eur) / 1_000_000,
        linked_at: row.linked_at
      })),
      active_bot_id: active?.bot_id ?? null,
      balances: {
        total_xp: totalXp,
        total_credit_micro_eur: totalCreditMicro,
        total_credit_eur: totalCreditMicro / 1_000_000
      }
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not fetch account profile", 401);
  }
}
