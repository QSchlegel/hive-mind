import { z } from "zod";
import { buildNonce } from "@hive-mind/shared";
import { withTransaction } from "@/lib/db";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { insertNonce } from "@/lib/nonces";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  wallet_address: z.string().min(4),
  chain: z.enum(["evm", "cardano", "bitcoin"])
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const account = await requireAccountSession(request);
    const body = await parseJson(request, schema);

    const nonce = buildNonce("link");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const message = `hive-mind.club link wallet\nnonce:${nonce}\naccount:${account.accountId}`;

    await withTransaction(async (client) => {
      await insertNonce(client, {
        nonce,
        walletAddress: body.wallet_address,
        chain: body.chain,
        actionType: "link_wallet",
        expiresAt: expiresAt.toISOString()
      });
    });

    return jsonResponse({
      ok: true,
      nonce,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      message
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid wallet link challenge payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not issue wallet link challenge", 400);
  }
}
