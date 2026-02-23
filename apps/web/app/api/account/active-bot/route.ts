import { z } from "zod";
import { getEnv } from "@/lib/env";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { query } from "@/lib/db";
import { ACTIVE_BOT_COOKIE, requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  bot_id: z.string().uuid()
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const account = await requireAccountSession(request);
    const body = await parseJson(request, schema);

    const linked = await query<{ bot_id: string }>(
      `select bot_id
       from account_wallet_links
       where account_id = $1
         and bot_id = $2
       limit 1`,
      [account.accountId, body.bot_id]
    );

    if (!linked.rowCount) {
      return errorResponse("Bot is not linked to this account", 404);
    }

    const env = getEnv();
    const response = jsonResponse({
      ok: true,
      active_bot_id: body.bot_id
    });

    const secure = env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.append(
      "set-cookie",
      `${ACTIVE_BOT_COOKIE}=${encodeURIComponent(body.bot_id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
    );

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid active bot payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not set active bot", 401);
  }
}
