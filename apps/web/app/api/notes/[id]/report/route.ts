import { z } from "zod";
import { query } from "@/lib/db";
import { errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireSession } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().min(5).max(1000)
});

export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    const session = await requireSession(request);
    const body = await parseJson(request, schema);
    const { id } = await params;

    const result = await query<{ id: string }>(
      `insert into moderation_reports (reporter_bot_id, note_id, reason)
       values ($1, $2, $3)
       returning id`,
      [session.botId, id, body.reason]
    );

    return jsonResponse({ ok: true, report_id: result.rows[0].id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid report payload", 400, error.flatten());
    }

    return errorResponse(error instanceof Error ? error.message : "Could not submit report", 400);
  }
}
