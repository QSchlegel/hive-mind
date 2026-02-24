import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { issueBotJwt } from "@/lib/bot-jwt";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireAccountSession, requireLinkedBot } from "@/lib/session";

export const dynamic = "force-dynamic";

const EXPIRY_HOURS: Record<string, number> = {
  "1m": 24 * 30,
  "1y": 24 * 365,
  never: 24 * 365 * 10
};

const schema = z.object({
  bot_id: z.string().uuid().optional(),
  expires_in_hours: z.coerce.number().int().min(1).max(24 * 365 * 10).optional(),
  label: z.string().min(1).max(120).optional(),
  expiry: z.enum(["1m", "1y", "never"]).optional()
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const body = await parseJson(request, schema);

    if (body.bot_id != null) {
      const session = await requireLinkedBot(request, body.bot_id);
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
    }

    if (body.expiry == null) {
      return errorResponse("Provide bot_id (existing bot) or expiry (create new bot)", 400);
    }

    const account = await requireAccountSession(request);
    const expiresInHours = EXPIRY_HOURS[body.expiry] ?? EXPIRY_HOURS["1y"];

    const syntheticCount = await query<{ n: string }>(
      `select count(*)::text as n
       from account_wallet_links
       where account_id = $1 and wallet_address like '0xsynthetic-%'`,
      [account.accountId]
    );
    const nextNum = (parseInt(syntheticCount.rows[0]?.n ?? "0", 10) + 1);
    const displayLabel = (body.label?.trim() || `bot-${nextNum}`).slice(0, 120);

    const botId = randomUUID();
    const walletChain = "evm" as const;
    const walletAddress = `0xsynthetic-${botId}`;

    await withTransaction(async (client) => {
      await client.query(
        `insert into bots (id, wallet_chain, wallet_address, status)
         values ($1, $2, $3, 'active')`,
        [botId, walletChain, walletAddress]
      );
      await client.query(
        `insert into account_wallet_links (account_id, wallet_chain, wallet_address, bot_id, display_label)
         values ($1, $2, $3, $4, $5)`,
        [account.accountId, walletChain, walletAddress, botId, displayLabel]
      );
    });

    const issued = await issueBotJwt({
      botId,
      accountId: account.accountId,
      accountEmail: account.email,
      accountName: account.name,
      walletChain,
      walletAddress,
      expiresInHours
    });

    return jsonResponse({
      ok: true,
      bot_id: botId,
      wallet_chain: walletChain,
      wallet_address: walletAddress,
      label: displayLabel,
      expiry: body.expiry,
      expires_at: issued.expiresAt,
      bot_jwt: issued.token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid bot jwt payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not create bot jwt", 401);
  }
}
