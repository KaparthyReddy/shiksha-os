import { verifyAuditChain } from "@shiksha/core";
import { auditLog, auditAnchors, users, tenants, withTenant, eq, and, desc, sql, type Db } from "@shiksha/db";
import type { Mailer } from "../mail";
import { log } from "../log";

const HOUR = 3_600_000;

export async function anchorAudit(db: Db, mailer: Mailer, now = Date.now()): Promise<void> {
  const all = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  for (const t of all) {
    try {
      await anchorTenant(db, mailer, t, now);
    } catch (e) {
      log.error(`audit anchor failed for ${t.name}`, e);
    }
  }
}

async function anchorTenant(db: Db, mailer: Mailer, t: { id: string; name: string }, now: number) {
  const outcome = await withTenant(db, t.id, async (tx) => {
    const [head] = await tx
      .select({ id: auditLog.id, hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.tenantId, t.id))
      .orderBy(desc(auditLog.id))
      .limit(1);
    if (!head) return null;

    const chain = await verifyAuditChain(tx, t.id);

    // The baseline is the highest anchor ever recorded, so deleting recent entries stays visible.
    const [base] = await tx
      .select()
      .from(auditAnchors)
      .where(eq(auditAnchors.tenantId, t.id))
      .orderBy(desc(auditAnchors.lastAuditId), desc(auditAnchors.id))
      .limit(1);

    const problems: string[] = [];
    if (!chain.ok) problems.push(`hash chain broken at entry #${chain.brokenAtId} (${chain.reason})`);
    if (base) {
      const [prior] = await tx
        .select({ hash: auditLog.hash })
        .from(auditLog)
        .where(and(eq(auditLog.tenantId, t.id), eq(auditLog.id, base.lastAuditId)))
        .limit(1);
      if (!prior) problems.push(`entry #${base.lastAuditId}, anchored earlier, no longer exists (deleted?)`);
      else if (prior.hash !== base.headHash) problems.push(`entry #${base.lastAuditId} was altered after it was anchored`);
    }
    if (problems.length > 0) log.error(`AUDIT INTEGRITY PROBLEM for ${t.name}: ${problems.join("; ")}`);

    const [lastMail] = await tx
      .select({ at: auditAnchors.emailedAt })
      .from(auditAnchors)
      .where(and(eq(auditAnchors.tenantId, t.id), sql`${auditAnchors.emailedAt} is not null`))
      .orderBy(desc(auditAnchors.id))
      .limit(1);
    const sinceMail = lastMail?.at ? now - lastMail.at.getTime() : Infinity;
    const willEmail = sinceMail > (problems.length > 0 ? 6 * HOUR : 24 * HOUR);

    const changed = !base || head.id > base.lastAuditId;
    if (!changed && !(problems.length > 0 && willEmail)) return null;

    const [cnt] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.tenantId, t.id));

    await tx.insert(auditAnchors).values({
      tenantId: t.id,
      lastAuditId: head.id,
      headHash: head.hash,
      entries: cnt?.n ?? 0,
      ok: problems.length === 0,
      emailedAt: willEmail ? new Date(now) : null,
    });

    const admins = willEmail
      ? await tx
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
      : [];

    return { head, entries: cnt?.n ?? 0, problems, admins: admins.map((a) => a.email) };
  });

  if (!outcome) return;
  log.info(`audit anchor for ${t.name}: entry #${outcome.head.id}, ${outcome.entries} entries, ${outcome.problems.length ? "PROBLEMS" : "ok"}`);

  if (outcome.admins.length > 0) {
    const bad = outcome.problems.length > 0;
    await mailer.send({
      to: outcome.admins,
      subject: bad ? `[ALERT] Audit log integrity problem - ${t.name}` : `Audit anchor - ${t.name}`,
      text: [
        bad ? `Problems found:\n- ${outcome.problems.join("\n- ")}\n` : "The audit log verified cleanly.\n",
        `Latest entry: #${outcome.head.id}`,
        `Head hash:    ${outcome.head.hash}`,
        `Total entries: ${outcome.entries}`,
        "",
        "Keep this email. Together with the stored anchors, it lets you prove the log was not rewound.",
      ].join("\n"),
    });
  }
}
