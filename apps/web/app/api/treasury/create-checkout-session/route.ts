import Stripe from "stripe";
import { z } from "zod";
import { query } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  amount_eur: z.number().positive().max(50_000).default(25)
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const session = await requireAccountSession(request);
    const body = await parseJson(request, schema);
    const env = getEnv();

    if (!env.STRIPE_SECRET_KEY) {
      return errorResponse("Stripe secret key is not configured", 500);
    }

    const treasuryAccount = await query<{ id: string; provider: "stripe" | "cross_chain" }>(
      `select id, provider
       from treasury_accounts
       where status = 'active'
       order by updated_at desc
       limit 1`
    );

    if (!treasuryAccount.rowCount) {
      return errorResponse("No active treasury account configured", 500);
    }

    if (treasuryAccount.rows[0].provider !== "stripe") {
      return errorResponse("Treasury funding via Stripe is disabled while cross-chain custody is active", 409);
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: {
        source: "hive-mind-treasury-fund",
        contributor_account_id: session.accountId,
        treasury_account_id: treasuryAccount.rows[0].id
      },
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(body.amount_eur * 100),
            product_data: {
              name: "Hive Mind treasury contribution"
            }
          },
          quantity: 1
        }
      ]
    });

    return jsonResponse({ ok: true, checkout_url: checkout.url, checkout_id: checkout.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid treasury checkout payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Treasury checkout creation failed", 400);
  }
}
