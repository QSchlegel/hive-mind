import Stripe from "stripe";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireSession } from "@/lib/session";

const schema = z.object({
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  amount_eur: z.number().positive().max(1000).default(5)
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, schema);
    const env = getEnv();

    if (!env.STRIPE_SECRET_KEY) {
      return errorResponse("Stripe secret key is not configured", 500);
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: {
        bot_id: session.botId,
        source: "hive-mind-credit-topup"
      },
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(body.amount_eur * 100),
            product_data: {
              name: "Hive Mind bot credits"
            }
          },
          quantity: 1
        }
      ]
    });

    return jsonResponse({ ok: true, checkout_url: checkout.url, checkout_id: checkout.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid checkout payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Checkout creation failed", 400);
  }
}
