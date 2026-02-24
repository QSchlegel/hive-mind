import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = path.resolve(repoRoot, "docs");

export type DocsDocument = {
  content: string;
  relativePath: string;
  slug: string[];
  title: string;
};

function isValidSlugSegment(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("\0");
}

function isWithinDocsRoot(absolutePath: string): boolean {
  const relative = path.relative(docsRoot, absolutePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function isFile(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractTitle(content: string, fallbackFromFileName: string): string {
  for (const line of content.split(/\r?\n/u)) {
    const match = /^#\s+(.+?)\s*#*\s*$/u.exec(line);
    if (match) {
      const title = cleanInlineMarkdown(match[1]);
      if (title) {
        return title;
      }
    }
  }

  return fallbackFromFileName
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function readDocsMarkdown(slug: string[]): Promise<DocsDocument | null> {
  if (!slug.length || slug.some((segment) => !isValidSlugSegment(segment))) {
    return null;
  }

  const requestedPath = path.resolve(docsRoot, ...slug);
  if (!isWithinDocsRoot(requestedPath)) {
    return null;
  }

  const candidates = new Set<string>();
  if (path.extname(requestedPath).toLowerCase() === ".md") {
    candidates.add(requestedPath);
  } else {
    candidates.add(`${requestedPath}.md`);
    candidates.add(path.resolve(requestedPath, "index.md"));
  }

  for (const candidatePath of candidates) {
    if (!isWithinDocsRoot(candidatePath)) {
      continue;
    }

    if (!(await isFile(candidatePath))) {
      continue;
    }

    const content = await fs.readFile(candidatePath, "utf8");
    const relativePath = path.relative(docsRoot, candidatePath).split(path.sep).join("/");
    const fileName = path.basename(relativePath, ".md");

    return {
      content,
      relativePath,
      slug: relativePath.split("/").filter(Boolean),
      title: extractTitle(content, fileName)
    };
  }

  return null;
}
