import { z } from "zod";
import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RangeKey = "7d" | "30d" | "90d" | "all";

const querySchema = z.object({
  bot_id: z.string().uuid().optional(),
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

function sinceForRange(range: RangeKey): string | null {
  if (range === "all") {
    return null;
  }

  const daysByRange: Record<Exclude<RangeKey, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90
  };

  const since = new Date(Date.now() - daysByRange[range] * 24 * 60 * 60 * 1000);
  return since.toISOString();
}

function microToEur(value: number): number {
  return value / 1_000_000;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const account = await requireAccountSession(request);
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const since = sinceForRange(params.range);

    if (params.bot_id) {
      const linked = await query<{ bot_id: string }>(
        `select bot_id
         from account_wallet_links
         where account_id = $1
           and bot_id = $2
         limit 1`,
        [account.accountId, params.bot_id]
      );

      if (!linked.rowCount) {
        return errorResponse("Bot is not linked to this account", 404);
      }
    }

    const filters: string[] = [
      `exists (
         select 1
         from account_wallet_links awl
         where awl.account_id = $1
           and awl.bot_id = le.bot_id
       )`
    ];
    const baseArgs: unknown[] = [account.accountId];

    if (params.bot_id) {
      baseArgs.push(params.bot_id);
      filters.push(`le.bot_id = $${baseArgs.length}`);
    }

    if (since) {
      baseArgs.push(since);
      filters.push(`le.created_at >= $${baseArgs.length}::timestamptz`);
    }

    const whereClause = filters.join("\n       and ");

    const totals = await query<{
      eur_inflow_micro: string;
      eur_outflow_micro: string;
      eur_net_micro: string;
      xp_inflow: string;
      xp_outflow: string;
      xp_net: string;
      entry_count: number;
    }>(
      `select coalesce(sum(case when le.amount_micro_eur_signed > 0 then le.amount_micro_eur_signed else 0 end), 0)::text as eur_inflow_micro,
              coalesce(sum(case when le.amount_micro_eur_signed < 0 then -le.amount_micro_eur_signed else 0 end), 0)::text as eur_outflow_micro,
              coalesce(sum(le.amount_micro_eur_signed), 0)::text as eur_net_micro,
              coalesce(sum(case when le.amount_xp_signed > 0 then le.amount_xp_signed else 0 end), 0)::text as xp_inflow,
              coalesce(sum(case when le.amount_xp_signed < 0 then -le.amount_xp_signed else 0 end), 0)::text as xp_outflow,
              coalesce(sum(le.amount_xp_signed), 0)::text as xp_net,
              count(*)::int as entry_count
       from ledger_entries le
       where ${whereClause}`,
      baseArgs
    );

    const entryArgs = [...baseArgs, params.limit];
    const entries = await query<{
      id: string;
      bot_id: string;
      entry_type: string;
      amount_micro_eur_signed: string;
      amount_xp_signed: string;
      reference_type: string | null;
      reference_id: string | null;
      created_at: string;
      wallet_chain: "evm" | "cardano" | "bitcoin";
      wallet_address: string;
    }>(
      `select le.id,
              le.bot_id,
              le.entry_type,
              le.amount_micro_eur_signed::text,
              le.amount_xp_signed::text,
              le.reference_type,
              le.reference_id::text,
              le.created_at::text,
              b.wallet_chain,
              b.wallet_address
       from ledger_entries le
       join bots b on b.id = le.bot_id
       where ${whereClause}
       order by le.created_at desc
       limit $${entryArgs.length}`,
      entryArgs
    );

    const totalRow = totals.rows[0] ?? {
      eur_inflow_micro: "0",
      eur_outflow_micro: "0",
      eur_net_micro: "0",
      xp_inflow: "0",
      xp_outflow: "0",
      xp_net: "0",
      entry_count: 0
    };

    const eurInflowMicro = Number(totalRow.eur_inflow_micro);
    const eurOutflowMicro = Number(totalRow.eur_outflow_micro);
    const eurNetMicro = Number(totalRow.eur_net_micro);

    return jsonResponse({
      ok: true,
      scope: {
        account_id: account.accountId,
        bot_id: params.bot_id ?? null,
        range: params.range,
        since,
        limit: params.limit
      },
      totals: {
        eur_inflow: microToEur(eurInflowMicro),
        eur_outflow: microToEur(eurOutflowMicro),
        eur_net: microToEur(eurNetMicro),
        xp_inflow: Number(totalRow.xp_inflow),
        xp_outflow: Number(totalRow.xp_outflow),
        xp_net: Number(totalRow.xp_net),
        entry_count: totalRow.entry_count
      },
      entries: entries.rows.map((row) => {
        const amountMicroEurSigned = Number(row.amount_micro_eur_signed);
        const amountXpSigned = Number(row.amount_xp_signed);

        return {
          id: row.id,
          bot_id: row.bot_id,
          bot: {
            wallet_chain: row.wallet_chain,
            wallet_address: row.wallet_address
          },
          entry_type: row.entry_type,
          amount_micro_eur_signed: amountMicroEurSigned,
          amount_eur_signed: microToEur(amountMicroEurSigned),
          amount_xp_signed: amountXpSigned,
          reference_type: row.reference_type,
          reference_id: row.reference_id,
          created_at: row.created_at
        };
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid ledger query", 400, error.flatten());
    }

    const message = error instanceof Error ? error.message : "Could not fetch account ledger";
    const status = message === "Missing authenticated account session" ? 401 : 400;
    return errorResponse(message, status);
  }
}
