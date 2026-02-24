import { z } from "zod";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { getBotCallbackConfig, upsertBotCallbackConfig } from "@/lib/note-callbacks";
import { requireLinkedBot } from "@/lib/session";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  endpoint_url: z.string().url().max(2048),
  enabled: z.boolean(),
  events: z.object({
    note_created: z.boolean(),
    note_edited: z.boolean()
  })
});

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireLinkedBot(request);
    const callback = await getBotCallbackConfig(session.botId);

    return jsonResponse({
      ok: true,
      callback
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not fetch callback config", 401);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const session = await requireLinkedBot(request);
    const body = await parseJson(request, putSchema);

    const result = await upsertBotCallbackConfig({
      accountId: session.accountId,
      botId: session.botId,
      endpointUrl: body.endpoint_url,
      enabled: body.enabled,
      events: body.events
    });

    return jsonResponse({
      ok: true,
      callback: result.config,
      signing_secret: result.createdSecret
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid callback config payload", 400, error.flatten());
    }

    const message = error instanceof Error ? error.message : "Could not update callback config";
    const status = message === "Missing authenticated account session" || message === "No linked bot found for this account" ? 401 : 400;
    return errorResponse(message, status);
  }
}
