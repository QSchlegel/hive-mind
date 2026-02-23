import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;

    const versions = await query<{
      id: string;
      version: number;
      changed_chars: number;
      xp_minted: number;
      cost_micro_eur: number;
      created_at: string;
      git_commit_sha: string | null;
      ipfs_cid: string | null;
    }>(
      `select id,
              version,
              changed_chars,
              xp_minted,
              cost_micro_eur,
              created_at::text,
              git_commit_sha,
              ipfs_cid
       from note_versions
       where note_id = $1
       order by version desc`,
      [id]
    );

    return jsonResponse({ ok: true, versions: versions.rows });
  } catch {
    return errorResponse("Could not fetch versions", 500);
  }
}
