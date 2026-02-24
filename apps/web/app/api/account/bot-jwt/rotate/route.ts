import { z } from "zod";
import { issueBotJwt } from "@/lib/bot-jwt";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireBotJwt } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  expires_in_hours: z.coerce.number().int().min(1).max(24 * 365 * 10).optional()
});

/**
 * POST /api/account/bot-jwt/rotate
 * Authenticate with your current BotJwt (Authorization: Bearer <token>).
 * Returns a new BotJwt; optional body: { expires_in_hours?: number } (default 168 = 1 week).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireBotJwt(request);
    let body: z.infer<typeof schema> = {};
    try {
      body = await parseJson(request, schema);
    } catch {
      // Empty or invalid body: use defaults
    }
    const expiresInHours = body.expires_in_hours ?? 24 * 7;

    const issued = await issueBotJwt({
      botId: session.botId,
      accountId: session.accountId,
      accountEmail: session.email,
      accountName: session.name,
      walletChain: session.walletChain,
      walletAddress: session.walletAddress,
      expiresInHours
    });

    return jsonResponse({
      ok: true,
      bot_id: session.botId,
      wallet_chain: session.walletChain,
      wallet_address: session.walletAddress,
      expires_at: issued.expiresAt,
      bot_jwt: issued.token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request body", 400, error.flatten());
    }
    const message = error instanceof Error ? error.message : "Could not rotate JWT";
    const status = message.includes("Missing BotJwt") ? 401 : 401;
    return errorResponse(message, status);
  }
}
