import type { GraphEdge } from "./types";

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const TAG_REGEX = /(^|\s)#([a-zA-Z0-9_-]+)/g;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function extractEdges(markdown: string): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const match of markdown.matchAll(WIKI_LINK_REGEX)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    edges.push({
      toSlug: slugify(raw),
      edgeType: "wiki_link",
      label: raw
    });
  }

  for (const match of markdown.matchAll(TAG_REGEX)) {
    const raw = match[2]?.trim();
    if (!raw) {
      continue;
    }
    edges.push({
      toSlug: `tag-${slugify(raw)}`,
      edgeType: "tag",
      label: raw
    });
  }

  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.edgeType}:${edge.toSlug}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
