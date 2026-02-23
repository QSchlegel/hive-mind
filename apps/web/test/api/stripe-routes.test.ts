import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createCheckoutPost } from "../../app/api/stripe/create-checkout-session/route";
import { POST as webhookPost } from "../../app/api/stripe/webhook/route";
import { TEST_BOT_ID, TEST_SESSION, dbResult, makeJsonRequest, makeTextRequest } from "./helpers";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  requireSession: vi.fn(),
  withTransaction: vi.fn(),
  stripeCheckoutCreate: vi.fn(),
  stripeConstructEvent: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireSession
}));

vi.mock("@/lib/db", () => ({
  withTransaction: mocks.withTransaction
}));

vi.mock("stripe", () => {
  class Stripe {
    checkout = {
      sessions: {
        create: mocks.stripeCheckoutCreate
      }
    };

    webhooks = {
      constructEvent: mocks.stripeConstructEvent
    };

    constructor(_apiKey: string) {}
  }

  return { default: Stripe };
});

describe("stripe routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(TEST_SESSION);
  });

  describe("POST /api/stripe/create-checkout-session", () => {
    it("creates a top-up checkout session", async () => {
      mocks.getEnv.mockReturnValue({ STRIPE_SECRET_KEY: "sk_test_123" });
      mocks.stripeCheckoutCreate.mockResolvedValue({
        id: "cs_credit_1",
        url: "https://stripe.test/checkout/credit"
      });

      const response = await createCheckoutPost(
        makeJsonRequest({
          success_url: "https://hive-mind.test/success",
          cancel_url: "https://hive-mind.test/cancel",
          amount_eur: 12.5
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.checkout_id).toBe("cs_credit_1");
      expect(mocks.stripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          metadata: expect.objectContaining({
            bot_id: TEST_BOT_ID,
            source: "hive-mind-credit-topup"
          })
        })
      );
    });

    it("returns 500 when Stripe key is not configured", async () => {
      mocks.getEnv.mockReturnValue({});
      const response = await createCheckoutPost(
        makeJsonRequest({
          success_url: "https://hive-mind.test/success",
          cancel_url: "https://hive-mind.test/cancel",
          amount_eur: 5
        })
      );
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Stripe secret key is not configured");
    });

    it("returns 400 for invalid checkout payload", async () => {
      mocks.getEnv.mockReturnValue({ STRIPE_SECRET_KEY: "sk_test_123" });
      const response = await createCheckoutPost(makeJsonRequest({}));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Invalid checkout payload");
    });
  });

  describe("POST /api/stripe/webhook", () => {
    it("returns 500 when Stripe webhook config is missing", async () => {
      mocks.getEnv.mockReturnValue({ STRIPE_SECRET_KEY: "sk_test_123" });
      const response = await webhookPost(
        makeTextRequest("{}", {
          headers: { "stripe-signature": "sig_1" }
        })
      );
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe("Stripe is not configured");
    });

    it("returns 400 when signature header is missing", async () => {
      mocks.getEnv.mockReturnValue({
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123"
      });
      const response = await webhookPost(makeTextRequest("{}"));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Missing Stripe signature");
    });

    it("returns 400 for invalid webhook signature payload", async () => {
      mocks.getEnv.mockReturnValue({
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123"
      });
      mocks.stripeConstructEvent.mockImplementationOnce(() => {
        throw new Error("No signatures found matching expected signature");
      });

      const response = await webhookPost(
        makeTextRequest("{}", {
          headers: { "stripe-signature": "bad_sig" }
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain("No signatures found");
    });

    it("processes completed top-up events", async () => {
      mocks.getEnv.mockReturnValue({
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123"
      });
      mocks.stripeConstructEvent.mockReturnValue({
        id: "evt_credit_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_credit_1",
            amount_total: 1500,
            metadata: {
              source: "hive-mind-credit-topup",
              bot_id: TEST_BOT_ID
            }
          }
        }
      });

      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into stripe_events")) {
            return dbResult([{ event_id: "evt_credit_1" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await webhookPost(
        makeTextRequest("{}", {
          headers: { "stripe-signature": "sig_1" }
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
      expect(client.query).toHaveBeenCalledTimes(3);
    });

    it("ignores duplicate processed events", async () => {
      mocks.getEnv.mockReturnValue({
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123"
      });
      mocks.stripeConstructEvent.mockReturnValue({
        id: "evt_duplicate",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_duplicate",
            amount_total: 500,
            metadata: {
              source: "hive-mind-credit-topup",
              bot_id: TEST_BOT_ID
            }
          }
        }
      });

      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into stripe_events")) {
            return dbResult([], 0);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await webhookPost(
        makeTextRequest("{}", {
          headers: { "stripe-signature": "sig_1" }
        })
      );

      expect(response.status).toBe(200);
      expect(client.query).toHaveBeenCalledTimes(1);
    });

    it("processes treasury funding events", async () => {
      mocks.getEnv.mockReturnValue({
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123"
      });
      mocks.stripeConstructEvent.mockReturnValue({
        id: "evt_treasury_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_treasury_1",
            payment_intent: "pi_1",
            amount_total: 4500,
            metadata: {
              source: "hive-mind-treasury-fund",
              contributor_bot_id: TEST_BOT_ID,
              treasury_account_id: "treasury-1"
            }
          }
        }
      });

      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("insert into stripe_events")) {
            return dbResult([{ event_id: "evt_treasury_1" }]);
          }
          if (sql.includes("from treasury_accounts")) {
            return dbResult([{ id: "treasury-1", provider: "stripe" }]);
          }
          if (sql.includes("insert into treasury_contributions")) {
            return dbResult([{ id: "contrib-1" }]);
          }
          return dbResult([], 1);
        })
      };
      mocks.withTransaction.mockImplementationOnce(async (handler: (client: unknown) => Promise<unknown>) =>
        handler(client)
      );

      const response = await webhookPost(
        makeTextRequest("{}", {
          headers: { "stripe-signature": "sig_1" }
        })
      );

      expect(response.status).toBe(200);
      expect(client.query).toHaveBeenCalledTimes(4);
    });
  });
});
