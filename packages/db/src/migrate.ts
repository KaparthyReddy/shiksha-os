import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set (check your .env)");

  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: join(__dirname, "../drizzle") });
  await client.unsafe(readFileSync(join(__dirname, "../sql/rls.sql"), "utf8"));
  await client.end();
  console.log("✔ migrations + RLS policies applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
