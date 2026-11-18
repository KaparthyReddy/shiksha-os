import { expireOverdue } from "@shiksha/core";
import { tenants, withTenant, type Db } from "@shiksha/db";
import { log } from "../log";

export async function sweepExams(db: Db): Promise<void> {
  const all = await db.select({ id: tenants.id }).from(tenants);
  let finalized = 0;
  for (const t of all) {
    try {
      finalized += await withTenant(db, t.id, (tx) => expireOverdue(tx, Date.now()));
    } catch (e) {
      log.error(`exam sweep failed for tenant ${t.id}`, e);
    }
  }
  if (finalized > 0) log.info(`exam sweep: finalized ${finalized} overdue session(s)`);
}
