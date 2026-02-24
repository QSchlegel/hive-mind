import { assertTrustedMutationOrigin, errorResponse, jsonResponse } from "@/lib/http";
import { rotateBotCallbackSecret } from "@/lib/note-callbacks";
import { requireLinkedBot } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const session = await requireLinkedBot(request);

    const rotated = await rotateBotCallbackSecret(session.botId);

    return jsonResponse({
      ok: true,
      callback: rotated.config,
      signing_secret: rotated.signingSecret
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rotate callback secret";
    const status =
      message === "Missing authenticated account session" || message === "No linked bot found for this account"
        ? 401
        : message === "Callback config not found for active bot"
          ? 404
          : 400;
    return errorResponse(message, status);
  }
}
