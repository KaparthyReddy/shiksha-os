import { createDb, withTenant } from "./client";
import { tenants, users, courses } from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (check your .env)");
  const { db, client } = createDb(url, { max: 1 });
  let failed = false;
  const check = (ok: boolean, msg: string) => {
    console.log(`${ok ? "✔" : "✘"} ${msg}`);
    if (!ok) failed = true;
  };

  const all = await db.select().from(tenants);
  check(all.length >= 2, `found ${all.length} tenants (need 2 from the seed)`);

  const noContext = await db.select().from(users);
  check(noContext.length === 0, `no tenant context -> sees ${noContext.length} users (expected 0)`);

  for (const t of all) {
    const rows = await withTenant(db, t.id, (tx) => tx.select().from(users));
    const leaked = rows.filter((r) => r.tenantId !== t.id).length;
    check(leaked === 0, `${t.slug}: sees ${rows.length} users, ${leaked} leaked from other tenants`);
  }

  const [a, b] = all;
  try {
    await withTenant(db, a!.id, (tx) =>
      tx.insert(courses).values({ tenantId: b!.id, name: "Injected", code: "HACK" }),
    );
    check(false, "cross-tenant insert was ALLOWED (RLS broken)");
  } catch {
    check(true, "cross-tenant insert blocked by RLS");
  }

  await client.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
