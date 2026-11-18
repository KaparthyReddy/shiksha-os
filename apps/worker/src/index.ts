import { createDb } from "@shiksha/db";
import { env } from "./env";
import { log } from "./log";
import { createMailer } from "./mail";
import { buildJobs } from "./jobs";
import { startJobs } from "./scheduler";

async function main() {
  const { db, client } = createDb(env.DATABASE_URL, { max: 8 });
  const jobs = buildJobs(db, createMailer(env));
  const stop = startJobs(db, jobs);
  log.info(`worker started: ${jobs.map((j) => j.name).join(", ")}`);

  const shutdown = async () => {
    log.info("worker stopping");
    await stop();
    await client.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
