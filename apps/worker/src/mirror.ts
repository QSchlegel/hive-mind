import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import { create as createIpfsClient } from "ipfs-http-client";
import { readEnv } from "@hive-mind/config";

export interface MirrorInput {
  slug: string;
  title: string;
  contentMd: string;
  version: number;
}

export async function mirrorToGit(input: MirrorInput): Promise<{ commitSha: string }> {
  const env = readEnv(process.env);

  if (!env.VAULT_MIRROR_REPO_URL) {
    throw new Error("VAULT_MIRROR_REPO_URL is missing");
  }

  const workdir = path.resolve(process.cwd(), env.VAULT_MIRROR_WORKDIR);
  const git = simpleGit();
  const repoExists = await access(path.join(workdir, ".git"))
    .then(() => true)
    .catch(() => false);
  if (!repoExists) {
    await mkdir(path.dirname(workdir), { recursive: true });
    await git.clone(env.VAULT_MIRROR_REPO_URL, workdir);
  }

  const repoGit = simpleGit(workdir);
  await repoGit.addConfig("user.name", env.GIT_AUTHOR_NAME);
  await repoGit.addConfig("user.email", env.GIT_AUTHOR_EMAIL);

  await mkdir(path.join(workdir, "vault"), { recursive: true });
  const relativeNotePath = path.join("vault", `${input.slug}.md`);
  const notePath = path.join(workdir, relativeNotePath);

  const header = `# ${input.title}\n\n`;
  await writeFile(notePath, `${header}${input.contentMd}\n`, "utf8");

  await repoGit.add(relativeNotePath);
  await repoGit.commit(`note:${input.slug} v${input.version}`).catch(() => undefined);
  await repoGit.push("origin", "HEAD").catch(() => undefined);

  const commitSha = (await repoGit.revparse(["HEAD"]))?.trim();
  return { commitSha };
}

export async function mirrorToIpfs(input: MirrorInput): Promise<{ cid: string }> {
  const env = readEnv(process.env);

  const client = createIpfsClient({
    url: env.IPFS_API_URL ?? "http://127.0.0.1:5001/api/v0"
  });

  const payload = {
    slug: input.slug,
    title: input.title,
    version: input.version,
    content_md: input.contentMd,
    mirrored_at: new Date().toISOString()
  };

  const result = await client.add(JSON.stringify(payload));
  await client.pin.add(result.cid);

  return { cid: result.cid.toString() };
}
