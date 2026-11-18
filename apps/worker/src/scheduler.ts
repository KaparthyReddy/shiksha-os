import { sql, type Db } from "@shiksha/db";
import { log } from "./log";

export interface JobDef {
  name: string;
  everyMs: number;
  run: () => Promise<void>;
}

/**
 * Runs the job only if no other worker is running it right now. The advisory lock is held
 * for the duration of the transaction, so it releases itself even if this process dies.
 */
export async function runLocked(db: Db, job: JobDef): Promise<boolean> {
  let ran = false;
  await db.transaction(async (tx) => {
    const rows = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(hashtext(${"job:" + job.name})) as ok`,
    )) as unknown as { ok: boolean }[];
    if (!rows[0]?.ok) return;
    ran = true;
    await job.run();
  });
  return ran;
}

export function startJobs(db: Db, jobs: JobDef[]) {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();
  const inflight = new Set<Promise<void>>();

  const schedule = (job: JobDef, delayMs: number) => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const p: Promise<void> = runLocked(db, job)
        .then(() => undefined)
        .catch((e) => log.error(`job ${job.name} failed`, e))
        .finally(() => {
          inflight.delete(p);
          schedule(job, job.everyMs);
        });
      inflight.add(p);
    }, delayMs);
    timers.add(timer);
  };

  for (const job of jobs) schedule(job, 1_000);

  return async () => {
    stopped = true;
    timers.forEach((t) => clearTimeout(t));
    await Promise.allSettled([...inflight]);
  };
}
