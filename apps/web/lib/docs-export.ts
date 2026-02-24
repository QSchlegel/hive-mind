import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = path.resolve(repoRoot, "docs");
export const DOCS_EXPORT_ROOT = "hive-mind-docs";

export type DocsFile = {
  path: string;
  content: string;
};

async function walkDocsDirectory(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return walkDocsDirectory(absolutePath);
      }
      if (entry.isFile()) {
        return [absolutePath];
      }
      return [];
    })
  );

  return files.flat();
}

function toExportPath(filePath: string): string {
  const relative = path.relative(docsRoot, filePath).split(path.sep).join("/");
  return `${DOCS_EXPORT_ROOT}/${relative}`;
}

export async function readDocsDirectory(): Promise<DocsFile[]> {
  const files = await walkDocsDirectory(docsRoot);
  const docs = await Promise.all(
    files.map(async (filePath) => ({
      path: toExportPath(filePath),
      content: await fs.readFile(filePath, "utf8")
    }))
  );

  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createDocsArchive(): Promise<{ archive: Buffer; fileName: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hive-mind-docs-"));

  try {
    const stagedDocsRoot = path.resolve(tempDir, DOCS_EXPORT_ROOT);
    await fs.cp(docsRoot, stagedDocsRoot, { recursive: true });

    const { stdout } = await execFile("tar", ["-czf", "-", "-C", tempDir, DOCS_EXPORT_ROOT], {
      encoding: "buffer",
      maxBuffer: 50 * 1024 * 1024
    });

    const archive = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    return {
      archive,
      fileName: `${DOCS_EXPORT_ROOT}-${timestamp}.tar.gz`
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
