import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as treasuryGet } from "../../app/api/treasury/route";
import { POST as treasuryCheckoutPost } from "../../app/api/treasury/create-checkout-session/route";
import { GET as proposalsGet, POST as proposalsPost } from "../../app/api/treasury/proposals/route";
import { GET as proposalGet } from "../../app/api/treasury/proposals/[id]/route";
import { POST as voteProposalPost } from "../../app/api/treasury/proposals/[id]/vote/route";
import { POST as finalizeProposalPost } from "../../app/api/treasury/proposals/[id]/finalize/route";
import { TEST_BOT_ID, TEST_PROPOSAL_ID, dbResult, makeJsonRequest, makeRouteParams } from "./helpers";

const TEST_ACCOUNT = {
  accountId: "acct_test_1",
  email: "admin@hive-mind.club",
  name: "Test Admin",
  sessionId: "session-1"
};

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  getEnv: vi.fn(),
  requireSession: vi.fn(),
  requireAccountSession: vi.fn(),
  requireAdminTreasuryAccess: vi.fn(),
  verifyAndPersistActionSignature: vi.fn(),
  stripeCheckoutCreate: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  query: mocks.query,
  withTransaction: mocks.withTransaction
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireSession,
  requireAccountSession: mocks.requireAccountSession,
  requireAdminTreasuryAccess: mocks.requireAdminTreasuryAccess
}));

vi.mock("@/lib/actions", () => ({
  verifyAndPersistActionSignature: mocks.verifyAndPersistActionSignature
}));

vi.mock("stripe", () => {
  class Stripe {
    checkout = {
      sessions: {
        create: mocks.stripeCheckoutCreate
      }
    };

    constructor(_apiKey: string) {}
  }

  return { default: Stripe };
});

describe("treasury API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAccountSession.mockResolvedValue(TEST_ACCOUNT);
    mocks.requireAdminTreasuryAccess.mockResolvedValue(TEST_ACCOUNT);
    mocks.getEnv.mockReturnValue({
      NODE_ENV: "test",
      APP_DOMAIN: "hive-mind.club",
      STRIPE_SECRET_KEY: "sk_test_123",
      TREASURY_VOTE_QUORUM_XP: 1000,
      TREASURY_DEFAULT_VOTING_WINDOW_HOURS: 168
    });
    mocks.verifyAndPersistActionSignature.mockResolvedValue({ actionSignatureId: "sig-1" });
  });

  it("GET /api/treasury returns account and aggregate stats", async () => {
    mocks.query
      .mockResolvedValueOnce(
        dbResult([
          {
            id: "treasury-1",
            provider: "stripe",
            status: "active",
            currency: "eur",
            external_account_ref: null,
            network: null,
            balance_micro_eur: "5000000",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            total_confirmed_micro_eur: "3500000",
            confirmed_contributions: 3,
            unique_contributor_accounts: 2
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            open_count: 2,
            open_expired_count: 1,
            approved_count: 4,
            rejected_count: 3,
            funded_count: 1,
            reserved_micro_eur: "1200000",
            total_voted_xp: "6400"
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            payout_count: 1,
            total_payout_micro_eur: "750000"
          }
        ])
      );

    const response = await treasuryGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.treasury.account.balance_micro_eur).toBe(5_000_000);
    expect(json.treasury.payouts.total_micro_eur).toBe(750_000);
  });

  it("POST /api/treasury/create-checkout-session creates checkout with contributor_account_id", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([{ id: "treasury-1", provider: "stripe" }]));
    mocks.stripeCheckoutCreate.mockResolvedValue({
      id: "cs_treasury_1",
      url: "https://stripe.test/checkout/treasury"
    });

    const response = await treasuryCheckoutPost(
      makeJsonRequest({
        success_url: "https://hive-mind.test/success",
        cancel_url: "https://hive-mind.test/cancel",
        amount_eur: 100
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.checkout_id).toBe("cs_treasury_1");
    expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: "hive-mind-treasury-fund",
          contributor_account_id: TEST_ACCOUNT.accountId,
          treasury_account_id: "treasury-1"
        })
      })
    );
  });

  it("POST /api/treasury/create-checkout-session returns 409 when custody is cross-chain", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([{ id: "treasury-1", provider: "cross_chain" }]));

    const response = await treasuryCheckoutPost(
      makeJsonRequest({
        success_url: "https://hive-mind.test/success",
        cancel_url: "https://hive-mind.test/cancel",
        amount_eur: 50
      })
    );

    expect(response.status).toBe(409);
  });

  it("POST /api/treasury/proposals creates proposal with account identity", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from treasury_accounts")) {
          return dbResult([{ id: "treasury-1" }]);
        }
        if (sql.includes("insert into treasury_proposals")) {
          return dbResult([
            {
              id: TEST_PROPOSAL_ID,
              proposer_account_id: TEST_ACCOUNT.accountId,
              proposer_bot_id: null,
              title: "Fund moderation automation",
              summary: "A proposal",
              description_md: "This proposal requests funding for long-running moderation infra.",
              requested_micro_eur: "2500000",
              status: "open",
              vote_quorum_xp: "1000",
              yes_xp: "0",
              no_xp: "0",
              voting_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              created_at: "2026-01-01T00:00:00.000Z"
            }
          ]);
        }
        return dbResult([], 1);
      })
    };

    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) => handler(client));

    const response = await proposalsPost(
      makeJsonRequest({
        title: "Fund moderation automation",
        summary: "A proposal",
        description_md: "This proposal requests funding for long-running moderation infra.",
        requested_amount_eur: 2.5
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.proposal.proposer_account_id).toBe(TEST_ACCOUNT.accountId);
  });

  it("GET /api/treasury/proposals returns account-aware proposer metadata", async () => {
    mocks.query.mockResolvedValueOnce(
      dbResult([
        {
          id: TEST_PROPOSAL_ID,
          title: "Fund moderation automation",
          summary: "A proposal",
          requested_micro_eur: "2500000",
          status: "open",
          vote_quorum_xp: "1000",
          yes_xp: "700",
          no_xp: "200",
          voting_deadline: new Date(Date.now() + 60_000).toISOString(),
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          proposer_account_id: TEST_ACCOUNT.accountId,
          proposer_email: TEST_ACCOUNT.email,
          proposer_name: TEST_ACCOUNT.name,
          proposer_wallet_chain: "evm",
          proposer_wallet_address: "0x1111111111111111111111111111111111111111"
        }
      ])
    );

    const response = await proposalsGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.proposals[0].proposer.account_id).toBe(TEST_ACCOUNT.accountId);
  });

  it("POST /api/treasury/proposals/:id/vote casts vote with source_bot_id", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from treasury_proposals") && sql.includes("for update")) {
          return dbResult([
            {
              id: TEST_PROPOSAL_ID,
              status: "open",
              vote_quorum_xp: 1000,
              yes_xp: 300,
              no_xp: 100,
              voting_deadline: new Date(Date.now() + 60_000).toISOString()
            }
          ]);
        }
        if (sql.includes("from treasury_votes") && sql.includes("voter_account_id")) {
          return dbResult([], 0);
        }
        if (sql.includes("from account_wallet_links")) {
          return dbResult([
            {
              bot_id: TEST_BOT_ID,
              wallet_chain: "evm",
              wallet_address: "0x1111111111111111111111111111111111111111",
              xp_balance: 5_000
            }
          ]);
        }
        if (sql.includes("insert into treasury_votes")) {
          return dbResult([{ id: "vote-1" }]);
        }
        return dbResult([], 1);
      })
    };

    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) => handler(client));

    const response = await voteProposalPost(
      makeJsonRequest({
        vote: "yes",
        xp_spent: 250,
        source_bot_id: TEST_BOT_ID
      }),
      makeRouteParams(TEST_PROPOSAL_ID)
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.vote_id).toBe("vote-1");
    expect(json.source_bot_id).toBe(TEST_BOT_ID);
  });

  it("POST /api/treasury/proposals/:id/vote returns 400 when account already voted", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from treasury_proposals") && sql.includes("for update")) {
          return dbResult([
            {
              id: TEST_PROPOSAL_ID,
              status: "open",
              vote_quorum_xp: 1000,
              yes_xp: 300,
              no_xp: 100,
              voting_deadline: new Date(Date.now() + 60_000).toISOString()
            }
          ]);
        }
        if (sql.includes("from treasury_votes") && sql.includes("voter_account_id")) {
          return dbResult([{ id: "existing-vote" }]);
        }
        return dbResult([], 1);
      })
    };

    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) => handler(client));

    const response = await voteProposalPost(
      makeJsonRequest({
        vote: "yes",
        xp_spent: 250,
        source_bot_id: TEST_BOT_ID
      }),
      makeRouteParams(TEST_PROPOSAL_ID)
    );

    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe("This account has already voted on this proposal");
  });

  it("POST /api/treasury/proposals/:id/finalize finalizes expired proposal", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from treasury_proposals") && sql.includes("for update")) {
          return dbResult([
            {
              id: TEST_PROPOSAL_ID,
              status: "open",
              vote_quorum_xp: 1000,
              yes_xp: 900,
              no_xp: 100,
              voting_deadline: new Date(Date.now() - 60_000).toISOString()
            }
          ]);
        }
        return dbResult([], 1);
      })
    };

    mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) => handler(client));

    const response = await finalizeProposalPost(new Request("https://hive-mind.test/api", { method: "POST" }), makeRouteParams(TEST_PROPOSAL_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("approved");
  });

  it("GET /api/treasury/proposals/:id returns proposal and vote ledger", async () => {
    mocks.query
      .mockResolvedValueOnce(
        dbResult([
          {
            id: TEST_PROPOSAL_ID,
            title: "Fund moderation automation",
            summary: "A proposal",
            description_md: "Detailed proposal body",
            requested_micro_eur: "2500000",
            status: "open",
            vote_quorum_xp: "1000",
            yes_xp: "700",
            no_xp: "200",
            voting_deadline: new Date(Date.now() + 60_000).toISOString(),
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            proposer_account_id: TEST_ACCOUNT.accountId,
            proposer_email: TEST_ACCOUNT.email,
            proposer_name: TEST_ACCOUNT.name,
            proposer_bot_id: TEST_BOT_ID,
            proposer_wallet_chain: "evm",
            proposer_wallet_address: "0x1111111111111111111111111111111111111111",
            treasury_provider: "stripe",
            payout_transfer_reference: null,
            payout_receipt_url: null,
            payout_notes: null,
            payout_funded_at: null,
            payout_funded_by_account_id: null
          }
        ])
      )
      .mockResolvedValueOnce(
        dbResult([
          {
            id: "vote-1",
            vote: "yes",
            xp_spent: 100,
            created_at: "2026-01-02T00:00:00.000Z",
            voter_account_id: TEST_ACCOUNT.accountId,
            voter_email: TEST_ACCOUNT.email,
            voter_name: TEST_ACCOUNT.name,
            source_bot_id: TEST_BOT_ID,
            wallet_chain: "evm",
            wallet_address: "0x1111111111111111111111111111111111111111"
          }
        ])
      );

    const response = await proposalGet(new Request("https://hive-mind.test", { method: "GET" }), makeRouteParams(TEST_PROPOSAL_ID));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.proposal.id).toBe(TEST_PROPOSAL_ID);
    expect(json.votes).toHaveLength(1);
  });

  it("GET /api/treasury/proposals/:id returns 404 for missing proposal", async () => {
    mocks.query.mockResolvedValueOnce(dbResult([], 0));

    const response = await proposalGet(new Request("https://hive-mind.test", { method: "GET" }), makeRouteParams(TEST_PROPOSAL_ID));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Treasury proposal not found");
  });
});
