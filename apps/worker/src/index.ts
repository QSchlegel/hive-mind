import { readEnv } from "@hive-mind/config";
import { withTransaction } from "./db";
import { mirrorToGit, mirrorToIpfs } from "./mirror";

type Job = {
  id: string;
  target: "git" | "ipfs";
  attempts: number;
  note_version_id: string;
  slug: string;
  title: string;
  content_md: string;
  version: number;
};

async function acquireJob(): Promise<Job | null> {
  return withTransaction(async (client) => {
    const locked = await client.query<Job>(
      `select mj.id,
              mj.target,
              mj.attempts,
              mj.note_version_id,
              n.slug,
              n.title,
              nv.content_md,
              nv.version
       from mirror_jobs mj
       join note_versions nv on nv.id = mj.note_version_id
       join notes n on n.id = nv.note_id
       where mj.status in ('queued', 'failed')
         and mj.available_at <= now()
       order by mj.created_at asc
       limit 1
       for update skip locked`
    );

    if (!locked.rowCount) {
      return null;
    }

    const job = locked.rows[0];

    await client.query(
      `update mirror_jobs
       set status = 'processing',
           attempts = attempts + 1,
           updated_at = now()
       where id = $1`,
      [job.id]
    );

    return {
      ...job,
      attempts: job.attempts + 1
    };
  });
}

async function completeJob(jobId: string, updates: { commitSha?: string; ipfsCid?: string }): Promise<void> {
  await withTransaction(async (client) => {
    if (updates.commitSha) {
      await client.query(
        `update note_versions
         set git_commit_sha = $2
         where id = (select note_version_id from mirror_jobs where id = $1)`,
        [jobId, updates.commitSha]
      );
    }

    if (updates.ipfsCid) {
      await client.query(
        `update note_versions
         set ipfs_cid = $2
         where id = (select note_version_id from mirror_jobs where id = $1)`,
        [jobId, updates.ipfsCid]
      );
    }

    await client.query(`update mirror_jobs set status = 'completed', updated_at = now() where id = $1`, [jobId]);
  });
}

async function failJob(job: Job, error: Error): Promise<void> {
  const env = readEnv(process.env);
  const backoffSeconds = Math.min(120, 2 ** job.attempts);
  const nextStatus = job.attempts >= env.WORKER_MAX_ATTEMPTS ? "dead_letter" : "failed";

  await withTransaction(async (client) => {
    await client.query(
      `update mirror_jobs
       set status = $2,
           last_error = $3,
           available_at = case when $2 = 'failed' then now() + ($4 || ' seconds')::interval else available_at end,
           updated_at = now()
       where id = $1`,
      [job.id, nextStatus, error.message.slice(0, 8000), backoffSeconds]
    );
  });
}

async function processOneJob(): Promise<boolean> {
  const job = await acquireJob();
  if (!job) {
    return false;
  }

  try {
    if (job.target === "git") {
      const mirrored = await mirrorToGit({
        slug: job.slug,
        title: job.title,
        contentMd: job.content_md,
        version: job.version
      });
      await completeJob(job.id, { commitSha: mirrored.commitSha });
      console.log(`[worker] mirrored to git job=${job.id} sha=${mirrored.commitSha}`);
      return true;
    }

    const mirrored = await mirrorToIpfs({
      slug: job.slug,
      title: job.title,
      contentMd: job.content_md,
      version: job.version
    });

    await completeJob(job.id, { ipfsCid: mirrored.cid });
    console.log(`[worker] mirrored to ipfs job=${job.id} cid=${mirrored.cid}`);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown mirror failure");
    await failJob(job, err);
    console.error(`[worker] mirror failed job=${job.id}`, err.message);
    return true;
  }
}

async function main(): Promise<void> {
  const env = readEnv(process.env);
  console.log("[worker] started", {
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    maxAttempts: env.WORKER_MAX_ATTEMPTS
  });

  while (true) {
    const worked = await processOneJob();
    if (!worked) {
      await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
    }
  }
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
