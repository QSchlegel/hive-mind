import Stripe from "stripe";
import { withTransaction } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { errorResponse, jsonResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return errorResponse("Stripe is not configured", 500);
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return errorResponse("Missing Stripe signature", 400);
  }

  const bodyText = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid Stripe event", 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const source = session.metadata?.source ?? "hive-mind-credit-topup";
    const botId = session.metadata?.bot_id ?? null;
    const contributorBotId = session.metadata?.contributor_bot_id ?? null;
    const contributorAccountId = session.metadata?.contributor_account_id ?? null;
    const treasuryAccountId = session.metadata?.treasury_account_id ?? null;
    const amountTotalCents = session.amount_total ?? 0;

    if (amountTotalCents > 0) {
      const microEur = amountTotalCents * 10_000;

      await withTransaction(async (client) => {
        const inserted = await client.query<{ event_id: string }>(
          `insert into stripe_events (event_id)
           values ($1)
           on conflict do nothing
           returning event_id`,
          [event.id]
        );

        if (!inserted.rowCount) {
          return;
        }

        if (source === "hive-mind-credit-topup" && botId) {
          await client.query(
            `update bots
             set credit_balance_micro_eur = credit_balance_micro_eur + $2,
                 updated_at = now()
             where id = $1`,
            [botId, microEur]
          );

          await client.query(
            `insert into ledger_entries (bot_id, entry_type, amount_micro_eur_signed, amount_xp_signed, reference_type)
             values ($1, 'credit_topup', $2, 0, 'stripe_checkout')`,
            [botId, microEur]
          );
          return;
        }

        if (source === "hive-mind-treasury-fund") {
          const treasuryAccount = treasuryAccountId
            ? await client.query<{ id: string; provider: "stripe" | "cross_chain" }>(
                `select id, provider
                 from treasury_accounts
                 where id = $1
                   and status = 'active'
                 limit 1
                 for update`,
                [treasuryAccountId]
              )
            : await client.query<{ id: string; provider: "stripe" | "cross_chain" }>(
                `select id, provider
                 from treasury_accounts
                 where status = 'active'
                 order by updated_at desc
                 limit 1
                 for update`
              );

          if (!treasuryAccount.rowCount) {
            throw new Error("No active treasury account configured");
          }

          const account = treasuryAccount.rows[0];
          if (account.provider !== "stripe") {
            throw new Error("Treasury funding via Stripe is disabled while cross-chain custody is active");
          }

          const contributionInsert = await client.query<{ id: string }>(
            `insert into treasury_contributions (
              treasury_account_id,
              contributor_bot_id,
              contributor_account_id,
              provider,
              provider_reference,
              amount_micro_eur,
              currency,
              status,
              metadata
            )
            values ($1,$2,$3,'stripe',$4,$5,'eur','confirmed',$6::jsonb)
            on conflict (provider_reference) do nothing
            returning id`,
            [
              account.id,
              contributorBotId,
              contributorAccountId,
              session.id,
              microEur,
              JSON.stringify({
                stripe_event_id: event.id,
                checkout_session_id: session.id,
                payment_intent_id: session.payment_intent ?? null
              })
            ]
          );

          if (!contributionInsert.rowCount) {
            return;
          }

          await client.query(
            `update treasury_accounts
             set balance_micro_eur = balance_micro_eur + $2,
                 updated_at = now()
             where id = $1`,
            [account.id, microEur]
          );
        }
      });
    }
  }

  return jsonResponse({ received: true });
}
