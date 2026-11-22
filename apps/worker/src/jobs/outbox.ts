import { emailOutbox, tenants, withTenant, eq, asc, type Db } from "@shiksha/db";
import type { Mailer } from "../mail";
import { log } from "../log";

const BATCH = 25;
const MAX_ATTEMPTS = 5;

/** Sends queued emails. The body is blanked once sent so one-time links aren't kept in the database. */
export async function sendOutbox(db: Db, mailer: Mailer): Promise<void> {
  const all = await db.select({ id: tenants.id }).from(tenants);
  let sent = 0;

  for (const t of all) {
    const pending = await withTenant(db, t.id, (tx) =>
      tx.select().from(emailOutbox).where(eq(emailOutbox.status, "pending")).orderBy(asc(emailOutbox.id)).limit(BATCH),
    );

    for (const m of pending) {
      try {
        await mailer.send({ to: m.toEmail, subject: m.subject, text: m.bodyText });
        await withTenant(db, t.id, (tx) =>
          tx
            .update(emailOutbox)
            .set({ status: "sent", sentAt: new Date(), bodyText: "", attempts: m.attempts + 1 })
            .where(eq(emailOutbox.id, m.id)),
        );
        sent++;
      } catch (e) {
        const attempts = m.attempts + 1;
        log.error(`email ${m.id} failed (attempt ${attempts})`, e);
        await withTenant(db, t.id, (tx) =>
          tx
            .update(emailOutbox)
            .set({
              attempts,
              lastError: String(e).slice(0, 300),
              status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
              bodyText: attempts >= MAX_ATTEMPTS ? "" : m.bodyText,
            })
            .where(eq(emailOutbox.id, m.id)),
        );
      }
    }
  }
  if (sent > 0) log.info(`outbox: sent ${sent} email(s)`);
}
