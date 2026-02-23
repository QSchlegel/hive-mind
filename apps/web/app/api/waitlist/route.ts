import { z } from "zod";
import { query } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";

const schema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  wallet_address: z.string().trim().min(4).max(256),
  wallet_chain: z.enum(["evm", "cardano", "bitcoin"]),
  bot_use_case: z.string().trim().min(10).max(2000),
  privacy_consent: z.literal(true),
  company: z.string().trim().optional()
});

function requestOrigin(request: Request): string | null {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return originHeader;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function trustedOrigins(): Set<string> {
  const origins = new Set<string>(["http://127.0.0.1:3000", "http://localhost:3000"]);
  const appDomain = process.env.APP_DOMAIN?.trim();

  if (appDomain) {
    origins.add(`https://${appDomain}`);
    origins.add(`https://www.${appDomain}`);
  }

  const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim();
  if (betterAuthUrl) {
    origins.add(betterAuthUrl);
  }

  return origins;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const incomingOrigin = requestOrigin(request);
    if (incomingOrigin && !trustedOrigins().has(incomingOrigin)) {
      return errorResponse("Forbidden request origin", 403);
    }

    const body = await parseJson(request, schema);

    if (body.company && body.company.length > 0) {
      return jsonResponse({
        ok: true,
        status: "pending"
      });
    }

    const upserted = await query<{ id: string; status: string }>(
      `with existing as (
         select id
         from waitlist_entries
         where lower(email) = lower($1)
         limit 1
       ),
       inserted as (
         insert into waitlist_entries (email, wallet_address, wallet_chain, bot_use_case, privacy_consent_at)
         select $1, $2, $3, $4, now()
         where not exists (select 1 from existing)
         returning id, status
       ),
       updated as (
         update waitlist_entries
         set
           wallet_address = $2,
           wallet_chain = $3,
           bot_use_case = $4,
           status = case when status = 'approved' then status else 'pending' end,
           privacy_consent_at = now(),
           updated_at = now()
         where id in (select id from existing)
         returning id, status
       )
       select id, status from inserted
       union all
       select id, status from updated
       limit 1`,
      [body.email, body.wallet_address, body.wallet_chain, body.bot_use_case]
    );

    if (upserted.rows.length === 0) {
      throw new Error("Could not upsert waitlist entry");
    }

    return jsonResponse({
      ok: true,
      waitlist_id: upserted.rows[0].id,
      status: upserted.rows[0].status
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid waitlist payload", 400, error.flatten());
    }

    if (error instanceof Error && error.message === "Invalid JSON body") {
      return errorResponse("Invalid JSON body", 400);
    }

    return errorResponse("Could not create waitlist entry", 500);
  }
}
