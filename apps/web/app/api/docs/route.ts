import { DOCS_EXPORT_ROOT, readDocsDirectory } from "@/lib/docs-export";
import { errorResponse, jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const files = await readDocsDirectory();
    const includeContent = new URL(request.url).searchParams.get("include") === "content";

    return jsonResponse(
      {
        ok: true,
        root: DOCS_EXPORT_ROOT,
        count: files.length,
        mode: includeContent ? "full" : "index",
        files: includeContent
          ? files
          : files.map((file) => ({
              path: file.path,
              chars: file.content.length
            }))
      },
      200
    );
  } catch {
    return errorResponse("Could not read docs directory", 500);
  }
}
