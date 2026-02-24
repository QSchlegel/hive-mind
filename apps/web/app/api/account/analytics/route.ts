import { z } from "zod";
import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RangeKey = "7d" | "30d" | "90d" | "all";
type TimeBucket = "day" | "week";

const querySchema = z.object({
  bot_id: z.string().uuid().optional(),
  range: z.enum(["7d", "30d", "90d", "all"]).default("30d")
});

function rangeConfig(range: RangeKey): { since: string | null; bucket: TimeBucket } {
  if (range === "all") {
    return { since: null, bucket: "week" };
  }

  const daysByRange: Record<Exclude<RangeKey, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90
  };

  const since = new Date(Date.now() - daysByRange[range] * 24 * 60 * 60 * 1000).toISOString();
  return { since, bucket: "day" };
}

function microToEur(value: number): number {
  return value / 1_000_000;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const account = await requireAccountSession(request);
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const { since, bucket } = rangeConfig(params.range);

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

    const accountFilters: string[] = ["awl.account_id = $1"];
    const ledgerFilters: string[] = [
      `exists (
         select 1
         from account_wallet_links awl
         where awl.account_id = $1
           and awl.bot_id = le.bot_id
       )`
    ];
    const callbackFilters: string[] = [
      `exists (
         select 1
         from account_wallet_links awl
         where awl.account_id = $1
           and awl.bot_id = cpj.bot_id
       )`
    ];

    const args: unknown[] = [account.accountId];

    if (params.bot_id) {
      args.push(params.bot_id);
      accountFilters.push(`awl.bot_id = $${args.length}`);
      ledgerFilters.push(`le.bot_id = $${args.length}`);
      callbackFilters.push(`cpj.bot_id = $${args.length}`);
    }

    if (since) {
      args.push(since);
      ledgerFilters.push(`le.created_at >= $${args.length}::timestamptz`);
      callbackFilters.push(`cpj.created_at >= $${args.length}::timestamptz`);
    }

    const accountWhere = accountFilters.join("\n       and ");
    const ledgerWhere = ledgerFilters.join("\n       and ");
    const callbackWhere = callbackFilters.join("\n       and ");

    const balances = await query<{
      linked_bot_count: number;
      total_xp_balance: string;
      total_credit_micro_eur: string;
    }>(
      `select count(*)::int as linked_bot_count,
              coalesce(sum(b.xp_balance), 0)::text as total_xp_balance,
              coalesce(sum(b.credit_balance_micro_eur), 0)::text as total_credit_micro_eur
       from account_wallet_links awl
       join bots b on b.id = awl.bot_id
       where ${accountWhere}`,
      args.slice(0, params.bot_id ? 2 : 1)
    );

    const totals = await query<{
      entry_count: number;
      eur_inflow_micro: string;
      eur_outflow_micro: string;
      eur_net_micro: string;
      xp_inflow: string;
      xp_outflow: string;
      xp_net: string;
    }>(
      `select count(*)::int as entry_count,
              coalesce(sum(case when le.amount_micro_eur_signed > 0 then le.amount_micro_eur_signed else 0 end), 0)::text as eur_inflow_micro,
              coalesce(sum(case when le.amount_micro_eur_signed < 0 then -le.amount_micro_eur_signed else 0 end), 0)::text as eur_outflow_micro,
              coalesce(sum(le.amount_micro_eur_signed), 0)::text as eur_net_micro,
              coalesce(sum(case when le.amount_xp_signed > 0 then le.amount_xp_signed else 0 end), 0)::text as xp_inflow,
              coalesce(sum(case when le.amount_xp_signed < 0 then -le.amount_xp_signed else 0 end), 0)::text as xp_outflow,
              coalesce(sum(le.amount_xp_signed), 0)::text as xp_net
       from ledger_entries le
       where ${ledgerWhere}`,
      args
    );

    const breakdown = await query<{
      entry_type: string;
      entry_count: number;
      eur_inflow_micro: string;
      eur_outflow_micro: string;
      eur_net_micro: string;
      xp_inflow: string;
      xp_outflow: string;
      xp_net: string;
    }>(
      `select le.entry_type,
              count(*)::int as entry_count,
              coalesce(sum(case when le.amount_micro_eur_signed > 0 then le.amount_micro_eur_signed else 0 end), 0)::text as eur_inflow_micro,
              coalesce(sum(case when le.amount_micro_eur_signed < 0 then -le.amount_micro_eur_signed else 0 end), 0)::text as eur_outflow_micro,
              coalesce(sum(le.amount_micro_eur_signed), 0)::text as eur_net_micro,
              coalesce(sum(case when le.amount_xp_signed > 0 then le.amount_xp_signed else 0 end), 0)::text as xp_inflow,
              coalesce(sum(case when le.amount_xp_signed < 0 then -le.amount_xp_signed else 0 end), 0)::text as xp_outflow,
              coalesce(sum(le.amount_xp_signed), 0)::text as xp_net
       from ledger_entries le
       where ${ledgerWhere}
       group by le.entry_type
       order by entry_count desc, le.entry_type asc`,
      args
    );

    const bucketExpr = bucket === "week" ? "date_trunc('week', le.created_at)" : "date_trunc('day', le.created_at)";
    const timeseries = await query<{
      bucket_date: string;
      topup_micro: string;
      write_spend_micro: string;
      edit_spend_micro: string;
      cashback_micro: string;
      inflow_micro: string;
      outflow_micro: string;
      net_micro: string;
      xp_minted: string;
      xp_endorse_spend: string;
      xp_treasury_vote_spend: string;
      xp_inflow: string;
      xp_outflow: string;
      xp_net: string;
    }>(
      `select ${bucketExpr}::date::text as bucket_date,
              coalesce(sum(case when le.entry_type = 'credit_topup' then le.amount_micro_eur_signed else 0 end), 0)::text as topup_micro,
              coalesce(sum(case when le.entry_type = 'write_cost' then -le.amount_micro_eur_signed else 0 end), 0)::text as write_spend_micro,
              coalesce(sum(case when le.entry_type = 'edit_cost' then -le.amount_micro_eur_signed else 0 end), 0)::text as edit_spend_micro,
              coalesce(sum(case when le.entry_type = 'endorse_cashback' then le.amount_micro_eur_signed else 0 end), 0)::text as cashback_micro,
              coalesce(sum(case when le.amount_micro_eur_signed > 0 then le.amount_micro_eur_signed else 0 end), 0)::text as inflow_micro,
              coalesce(sum(case when le.amount_micro_eur_signed < 0 then -le.amount_micro_eur_signed else 0 end), 0)::text as outflow_micro,
              coalesce(sum(le.amount_micro_eur_signed), 0)::text as net_micro,
              coalesce(sum(case when le.entry_type = 'xp_mint' then le.amount_xp_signed else 0 end), 0)::text as xp_minted,
              coalesce(sum(case when le.entry_type = 'endorse_spend' then -le.amount_xp_signed else 0 end), 0)::text as xp_endorse_spend,
              coalesce(sum(case when le.entry_type = 'treasury_vote_spend' then -le.amount_xp_signed else 0 end), 0)::text as xp_treasury_vote_spend,
              coalesce(sum(case when le.amount_xp_signed > 0 then le.amount_xp_signed else 0 end), 0)::text as xp_inflow,
              coalesce(sum(case when le.amount_xp_signed < 0 then -le.amount_xp_signed else 0 end), 0)::text as xp_outflow,
              coalesce(sum(le.amount_xp_signed), 0)::text as xp_net
       from ledger_entries le
       where ${ledgerWhere}
       group by 1
       order by 1 asc`,
      args
    );

    const callbackSocial = await query<{
      callback_jobs_total: number;
      callback_jobs_delivered: string;
      callback_jobs_failed: string;
      callback_jobs_dead_letter: string;
      callback_jobs_queued: string;
      callback_jobs_processing: string;
    }>(
      `select count(*)::int as callback_jobs_total,
              coalesce(sum(case when cpj.status = 'delivered' then 1 else 0 end), 0)::text as callback_jobs_delivered,
              coalesce(sum(case when cpj.status = 'failed' then 1 else 0 end), 0)::text as callback_jobs_failed,
              coalesce(sum(case when cpj.status = 'dead_letter' then 1 else 0 end), 0)::text as callback_jobs_dead_letter,
              coalesce(sum(case when cpj.status = 'queued' then 1 else 0 end), 0)::text as callback_jobs_queued,
              coalesce(sum(case when cpj.status = 'processing' then 1 else 0 end), 0)::text as callback_jobs_processing
       from callback_postbox_jobs cpj
       where ${callbackWhere}`,
      args
    );

    const balanceRow = balances.rows[0] ?? {
      linked_bot_count: 0,
      total_xp_balance: "0",
      total_credit_micro_eur: "0"
    };

    const totalsRow = totals.rows[0] ?? {
      entry_count: 0,
      eur_inflow_micro: "0",
      eur_outflow_micro: "0",
      eur_net_micro: "0",
      xp_inflow: "0",
      xp_outflow: "0",
      xp_net: "0"
    };
    const socialRow = callbackSocial.rows[0] ?? {
      callback_jobs_total: 0,
      callback_jobs_delivered: "0",
      callback_jobs_failed: "0",
      callback_jobs_dead_letter: "0",
      callback_jobs_queued: "0",
      callback_jobs_processing: "0"
    };

    const callbackJobsTotal = socialRow.callback_jobs_total;
    const callbackJobsDelivered = Number(socialRow.callback_jobs_delivered);
    const callbackJobsFailed = Number(socialRow.callback_jobs_failed);
    const callbackJobsDeadLetter = Number(socialRow.callback_jobs_dead_letter);
    const callbackJobsQueued = Number(socialRow.callback_jobs_queued);
    const callbackJobsProcessing = Number(socialRow.callback_jobs_processing);
    const callbackJobsPending = callbackJobsQueued + callbackJobsProcessing;

    const byType = new Map<string, { eur_inflow_micro: number; eur_outflow_micro: number }>();
    for (const row of breakdown.rows) {
      byType.set(row.entry_type, {
        eur_inflow_micro: Number(row.eur_inflow_micro),
        eur_outflow_micro: Number(row.eur_outflow_micro)
      });
    }

    const topupMicro = byType.get("credit_topup")?.eur_inflow_micro ?? 0;
    const writeSpendMicro = byType.get("write_cost")?.eur_outflow_micro ?? 0;
    const editSpendMicro = byType.get("edit_cost")?.eur_outflow_micro ?? 0;
    const cashbackMicro = byType.get("endorse_cashback")?.eur_inflow_micro ?? 0;
    const writeEditSpendMicro = writeSpendMicro + editSpendMicro;

    return jsonResponse({
      ok: true,
      scope: {
        account_id: account.accountId,
        bot_id: params.bot_id ?? null,
        range: params.range,
        since,
        bucket
      },
      kpis: {
        linked_bot_count: balanceRow.linked_bot_count,
        total_xp_balance: Number(balanceRow.total_xp_balance),
        total_credit_micro_eur: Number(balanceRow.total_credit_micro_eur),
        total_credit_eur: microToEur(Number(balanceRow.total_credit_micro_eur)),
        entry_count: totalsRow.entry_count,
        eur_inflow: microToEur(Number(totalsRow.eur_inflow_micro)),
        eur_outflow: microToEur(Number(totalsRow.eur_outflow_micro)),
        eur_net: microToEur(Number(totalsRow.eur_net_micro)),
        xp_inflow: Number(totalsRow.xp_inflow),
        xp_outflow: Number(totalsRow.xp_outflow),
        xp_net: Number(totalsRow.xp_net)
      },
      timeseries: {
        cashflow: timeseries.rows.map((row) => ({
          bucket: row.bucket_date,
          topup_eur: microToEur(Number(row.topup_micro)),
          write_spend_eur: microToEur(Number(row.write_spend_micro)),
          edit_spend_eur: microToEur(Number(row.edit_spend_micro)),
          cashback_eur: microToEur(Number(row.cashback_micro)),
          inflow_eur: microToEur(Number(row.inflow_micro)),
          outflow_eur: microToEur(Number(row.outflow_micro)),
          net_eur: microToEur(Number(row.net_micro))
        })),
        xp: timeseries.rows.map((row) => ({
          bucket: row.bucket_date,
          minted_xp: Number(row.xp_minted),
          endorse_spend_xp: Number(row.xp_endorse_spend),
          treasury_vote_spend_xp: Number(row.xp_treasury_vote_spend),
          inflow_xp: Number(row.xp_inflow),
          outflow_xp: Number(row.xp_outflow),
          net_xp: Number(row.xp_net)
        }))
      },
      breakdown: breakdown.rows.map((row) => ({
        entry_type: row.entry_type,
        entry_count: row.entry_count,
        eur_inflow: microToEur(Number(row.eur_inflow_micro)),
        eur_outflow: microToEur(Number(row.eur_outflow_micro)),
        eur_net: microToEur(Number(row.eur_net_micro)),
        xp_inflow: Number(row.xp_inflow),
        xp_outflow: Number(row.xp_outflow),
        xp_net: Number(row.xp_net)
      })),
      social: {
        callback_jobs_total: callbackJobsTotal,
        callback_jobs_delivered: callbackJobsDelivered,
        callback_jobs_failed: callbackJobsFailed,
        callback_jobs_dead_letter: callbackJobsDeadLetter,
        callback_jobs_pending: callbackJobsPending,
        callback_delivery_success_rate: callbackJobsTotal > 0 ? callbackJobsDelivered / callbackJobsTotal : null
      },
      funding_panel: {
        total_topup_eur: microToEur(topupMicro),
        write_edit_spend_eur: microToEur(writeEditSpendMicro),
        cashback_eur: microToEur(cashbackMicro),
        available_credit_eur: microToEur(Number(balanceRow.total_credit_micro_eur)),
        coverage_ratio: writeEditSpendMicro > 0 ? topupMicro / writeEditSpendMicro : null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid analytics query", 400, error.flatten());
    }

    const message = error instanceof Error ? error.message : "Could not fetch account analytics";
    const status = message === "Missing authenticated account session" ? 401 : 400;
    return errorResponse(message, status);
  }
}
