import { z } from "zod";
import { errorResponse, jsonResponse } from "@/lib/http";
import { listBotCallbackDeliveries } from "@/lib/note-callbacks";
import { requireLinkedBot } from "@/lib/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["all", "failed", "dead_letter"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireLinkedBot(request);
    const searchParams = new URL(request.url).searchParams;

    const parsed = querySchema.parse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined
    });

    const deliveries = await listBotCallbackDeliveries(session.botId, parsed.status, parsed.limit);

    return jsonResponse({
      ok: true,
      status_filter: parsed.status,
      deliveries
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid callback deliveries query", 400, error.flatten());
    }

    return errorResponse(error instanceof Error ? error.message : "Could not fetch callback deliveries", 401);
  }
}
