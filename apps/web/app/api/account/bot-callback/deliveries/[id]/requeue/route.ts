import { assertTrustedMutationOrigin, errorResponse, jsonResponse } from "@/lib/http";
import { requeueBotCallbackDelivery } from "@/lib/note-callbacks";
import { requireLinkedBot } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const session = await requireLinkedBot(request);
    const { id } = await params;

    const queued = await requeueBotCallbackDelivery(session.botId, id);
    if (!queued) {
      return errorResponse("Callback delivery not found for active bot", 404);
    }

    return jsonResponse({ ok: true, delivery: queued });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not requeue callback delivery";
    const status = message === "Missing authenticated account session" || message === "No linked bot found for this account" ? 401 : 400;
    return errorResponse(message, status);
  }
}
