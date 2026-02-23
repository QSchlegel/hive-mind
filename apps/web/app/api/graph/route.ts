import { query } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/http";

export async function GET(): Promise<Response> {
  try {
    const nodes = await query<{ id: string; label: string; xp: number }>(
      `select n.id,
              n.slug as label,
              coalesce(sum(nv.xp_minted), 0)::int as xp
       from notes n
       left join note_versions nv on nv.note_id = n.id and nv.moderation_status = 'approved'
       where n.visibility = 'public'
         and n.moderation_status = 'approved'
       group by n.id, n.slug
       order by xp desc, n.slug asc
       limit 250`
    );

    const edges = await query<{ source: string; target: string; type: string }>(
      `select ne.from_note_id::text as source,
              ne.to_note_slug as target,
              ne.edge_type as type
       from note_edges ne
       join notes n on n.id = ne.from_note_id
       where n.visibility = 'public'
         and n.moderation_status = 'approved'
       order by ne.created_at desc
       limit 1000`
    );

    const idToSlug = new Map(nodes.rows.map((node) => [node.id, node.label]));

    return jsonResponse({
      nodes: nodes.rows.map((node) => ({ id: node.label, label: node.label, xp: node.xp })),
      edges: edges.rows.map((edge) => ({
        source: idToSlug.get(edge.source) ?? edge.source,
        target: edge.target,
        type: edge.type
      }))
    });
  } catch {
    return errorResponse("Could not fetch graph", 500);
  }
}
