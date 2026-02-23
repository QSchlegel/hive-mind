import { z } from "zod";
import { withTransaction } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";

const schema = z.object({
  code: z.string().min(6),
  bot_id: z.string().uuid().optional()
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseJson(request, schema);

    const result = await withTransaction(async (client) => {
      const invite = await client.query<{
        id: string;
        code: string;
        status: string;
        expires_at: string | null;
      }>(
        `select id, code, status, expires_at::text
         from invite_codes
         where code = $1
         for update`,
        [body.code]
      );

      if (!invite.rowCount) {
        throw new Error("Invite code not found");
      }

      const row = invite.rows[0];
      if (row.status !== "active") {
        throw new Error("Invite code is not active");
      }

      if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
        await client.query(`update invite_codes set status = 'expired' where id = $1`, [row.id]);
        throw new Error("Invite code expired");
      }

      if (body.bot_id) {
        await client.query(
          `update invite_codes
           set status = 'redeemed', redeemed_by_bot_id = $2
           where id = $1`,
          [row.id, body.bot_id]
        );
      }

      return {
        ok: true,
        code: row.code,
        status: body.bot_id ? "redeemed" : "valid"
      };
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid invite redeem payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Invite redeem failed", 400);
  }
}
