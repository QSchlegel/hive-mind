import { createDocsArchive } from "@/lib/docs-export";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const { archive, fileName } = await createDocsArchive();
    const body = Uint8Array.from(archive);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${fileName}"`,
        "content-length": String(body.byteLength),
        "cache-control": "no-store"
      }
    });
  } catch {
    return errorResponse("Could not create docs archive", 500);
  }
}
