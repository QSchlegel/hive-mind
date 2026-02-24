import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as ledgerGet } from "../../app/api/account/ledger/route";
import { GET as analyticsGet } from "../../app/api/account/analytics/route";
import { TEST_BOT_ID, dbResult } from "./helpers";

const TEST_ACCOUNT = {
  accountId: "acct_test_1",
  email: "admin@hive-mind.club",
  name: "Test Admin",
  sessionId: "session-1"
};

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireAccountSession: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query
}));

vi.mock("@/lib/session", () => ({
  requireAccountSession: mocks.requireAccountSession
}));

describe("account analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccountSession.mockResolvedValue(TEST_ACCOUNT);
  });

  it("GET /api/account/ledger returns scoped timeline and totals", async () => {
    mocks.query
      .mockResolvedValueOnce(dbResult([{ bot_id: TEST_BOT_ID }]))
      .mockResolvedValueOnce(
        dbResult([
          {
            eur_inflow_micro: "2500000",
            eur_outflow_micro: "750000",
            eur_net_micro: "1750000",
            xp_inflow: "1800",
            xp_outflow: "250",
            xp_net: "1550",
            entry_count: 3
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            id: "ledger-1",
            bot_id: TEST_BOT_ID,
            entry_type: "credit_topup",
            amount_micro_eur_signed: "2500000",
            amount_xp_signed: "0",
            reference_type: "stripe_checkout",
            reference_id: null,
            created_at: "2026-02-24T12:00:00.000Z",
            wallet_chain: "evm",
            wallet_address: "0x1111111111111111111111111111111111111111"
          }
        ])
      );

    const response = await ledgerGet(
      new Request(`https://hive-mind.test/api/account/ledger?bot_id=${TEST_BOT_ID}&range=7d&limit=50`)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.scope.account_id).toBe(TEST_ACCOUNT.accountId);
    expect(json.scope.bot_id).toBe(TEST_BOT_ID);
    expect(json.scope.range).toBe("7d");
    expect(json.scope.limit).toBe(50);
    expect(json.totals.eur_inflow).toBe(2.5);
    expect(json.totals.eur_outflow).toBe(0.75);
    expect(json.totals.xp_net).toBe(1550);
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].entry_type).toBe("credit_topup");
  });

  it("GET /api/account/ledger returns 404 when bot filter is not linked", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([], 0));

    const response = await ledgerGet(
      new Request(`https://hive-mind.test/api/account/ledger?bot_id=${TEST_BOT_ID}&range=30d`)
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Bot is not linked to this account");
  });

  it("GET /api/account/ledger returns zeroed totals for empty ledger", async () => {
    mocks.query
      .mockResolvedValueOnce(
        dbResult([
          {
            eur_inflow_micro: "0",
            eur_outflow_micro: "0",
            eur_net_micro: "0",
            xp_inflow: "0",
            xp_outflow: "0",
            xp_net: "0",
            entry_count: 0
          }
        ])
      )
      .mockResolvedValueOnce(dbResult([], 0));

    const response = await ledgerGet(new Request("https://hive-mind.test/api/account/ledger?range=30d"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.totals.entry_count).toBe(0);
    expect(json.totals.eur_net).toBe(0);
    expect(json.entries).toEqual([]);
  });

  it("GET /api/account/analytics returns KPI, timeseries, breakdown, and funding panel", async () => {
    mocks.query
      .mockResolvedValueOnce(dbResult([{ bot_id: TEST_BOT_ID }]))
      .mockResolvedValueOnce(
        dbResult([
          {
            linked_bot_count: 1,
            total_xp_balance: "4200",
            total_credit_micro_eur: "1250000"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            entry_count: 6,
            eur_inflow_micro: "2600000",
            eur_outflow_micro: "900000",
            eur_net_micro: "1700000",
            xp_inflow: "3200",
            xp_outflow: "700",
            xp_net: "2500"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            entry_type: "credit_topup",
            entry_count: 2,
            eur_inflow_micro: "2500000",
            eur_outflow_micro: "0",
            eur_net_micro: "2500000",
            xp_inflow: "0",
            xp_outflow: "0",
            xp_net: "0"
          },
          {
            entry_type: "write_cost",
            entry_count: 2,
            eur_inflow_micro: "0",
            eur_outflow_micro: "600000",
            eur_net_micro: "-600000",
            xp_inflow: "0",
            xp_outflow: "0",
            xp_net: "0"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            bucket_date: "2026-02-20",
            topup_micro: "1000000",
            write_spend_micro: "200000",
            edit_spend_micro: "100000",
            cashback_micro: "50000",
            inflow_micro: "1050000",
            outflow_micro: "300000",
            net_micro: "750000",
            xp_minted: "600",
            xp_endorse_spend: "100",
            xp_treasury_vote_spend: "50",
            xp_inflow: "600",
            xp_outflow: "150",
            xp_net: "450"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            callback_jobs_total: 5,
            callback_jobs_delivered: "4",
            callback_jobs_failed: "1",
            callback_jobs_dead_letter: "0",
            callback_jobs_queued: "0",
            callback_jobs_processing: "0"
          }
        ])
      );

    const response = await analyticsGet(
      new Request(`https://hive-mind.test/api/account/analytics?bot_id=${TEST_BOT_ID}&range=30d`)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.scope.account_id).toBe(TEST_ACCOUNT.accountId);
    expect(json.scope.bot_id).toBe(TEST_BOT_ID);
    expect(json.scope.bucket).toBe("day");
    expect(json.kpis.linked_bot_count).toBe(1);
    expect(json.kpis.total_credit_eur).toBe(1.25);
    expect(json.timeseries.cashflow).toHaveLength(1);
    expect(json.timeseries.xp[0].minted_xp).toBe(600);
    expect(json.breakdown).toHaveLength(2);
    expect(json.social.callback_jobs_total).toBe(5);
    expect(json.social.callback_jobs_delivered).toBe(4);
    expect(json.social.callback_delivery_success_rate).toBe(0.8);
    expect(json.funding_panel.total_topup_eur).toBe(2.5);
    expect(json.funding_panel.write_edit_spend_eur).toBe(0.6);
    expect(json.funding_panel.coverage_ratio).toBeCloseTo(4.1666666667, 6);
  });

  it("GET /api/account/analytics returns 404 when bot filter is not linked", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([], 0));

    const response = await analyticsGet(
      new Request(`https://hive-mind.test/api/account/analytics?bot_id=${TEST_BOT_ID}&range=30d`)
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Bot is not linked to this account");
  });

  it("GET /api/account/analytics returns zeroed aggregates for empty ledger", async () => {
    mocks.query
      .mockResolvedValueOnce(
        dbResult([
          {
            linked_bot_count: 0,
            total_xp_balance: "0",
            total_credit_micro_eur: "0"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            entry_count: 0,
            eur_inflow_micro: "0",
            eur_outflow_micro: "0",
            eur_net_micro: "0",
            xp_inflow: "0",
            xp_outflow: "0",
            xp_net: "0"
          }
        ])
      )
      .mockResolvedValueOnce(dbResult([], 0))
      .mockResolvedValueOnce(dbResult([], 0))
      .mockResolvedValueOnce(
        dbResult([
          {
            callback_jobs_total: 0,
            callback_jobs_delivered: "0",
            callback_jobs_failed: "0",
            callback_jobs_dead_letter: "0",
            callback_jobs_queued: "0",
            callback_jobs_processing: "0"
          }
        ])
      );

    const response = await analyticsGet(new Request("https://hive-mind.test/api/account/analytics?range=all"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope.bucket).toBe("week");
    expect(json.kpis.entry_count).toBe(0);
    expect(json.timeseries.cashflow).toEqual([]);
    expect(json.timeseries.xp).toEqual([]);
    expect(json.breakdown).toEqual([]);
    expect(json.social.callback_jobs_total).toBe(0);
    expect(json.social.callback_delivery_success_rate).toBeNull();
    expect(json.funding_panel.coverage_ratio).toBeNull();
  });

  it("returns 401 for unauthenticated session", async () => {
    mocks.requireAccountSession.mockRejectedValue(new Error("Missing authenticated account session"));

    const ledgerResponse = await ledgerGet(new Request("https://hive-mind.test/api/account/ledger"));
    const analyticsResponse = await analyticsGet(new Request("https://hive-mind.test/api/account/analytics"));

    expect(ledgerResponse.status).toBe(401);
    expect(analyticsResponse.status).toBe(401);
  });
});
