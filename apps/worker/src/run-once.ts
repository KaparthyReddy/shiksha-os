import { createDb } from "@shiksha/db";
import { env } from "./env";
import { createMailer } from "./mail";
import { buildJobs } from "./jobs";

async function main() {
  const name = process.argv[2];
  const { db, client } = createDb(env.DATABASE_URL, { max: 3 });
  const jobs = buildJobs(db, createMailer(env));
  const job = jobs.find((j) => j.name === name);
  if (!job) {
    console.error(`Unknown job "${name}". Available: ${jobs.map((j) => j.name).join(", ")}`);
    await client.end();
    process.exit(1);
  }
  await job.run();
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
