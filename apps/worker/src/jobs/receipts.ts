import { payments, invoices, students, users, tenants, withTenant, eq, and, isNull, asc, sql, type Db } from "@shiksha/db";
import { renderReceipt } from "../pdf/receipt";
import type { Mailer } from "../mail";
import { log } from "../log";

const BATCH = 25;

export async function sendReceipts(db: Db, mailer: Mailer): Promise<void> {
  const all = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  let sent = 0;

  for (const t of all) {
    const pending = await withTenant(db, t.id, (tx) =>
      tx
        .select({
          paymentId: payments.id,
          receiptNo: payments.receiptNo,
          amountPaise: payments.amountPaise,
          method: payments.method,
          reference: payments.reference,
          receivedAt: payments.receivedAt,
          invoiceTotalPaise: invoices.amountPaise,
          paidThroughPaise: sql<number>`(select coalesce(sum(p2.amount_paise), 0)::float8 from payments p2 where p2.invoice_id = ${payments.invoiceId} and p2.received_at <= ${payments.receivedAt})`,
          studentName: users.name,
          email: users.email,
          rollNo: students.rollNo,
        })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(isNull(payments.receiptEmailedAt))
        .orderBy(asc(payments.receivedAt))
        .limit(BATCH),
    );

    for (const p of pending) {
      try {
        const pdf = await renderReceipt({
          orgName: t.name,
          receiptNo: p.receiptNo,
          receivedAt: p.receivedAt,
          studentName: p.studentName,
          rollNo: p.rollNo,
          method: p.method,
          reference: p.reference,
          amountPaise: p.amountPaise,
          invoiceTotalPaise: p.invoiceTotalPaise,
          balancePaise: p.invoiceTotalPaise - p.paidThroughPaise,
        });

        await mailer.send({
          to: p.email,
          subject: `Payment receipt ${p.receiptNo}`,
          text: `Hi ${p.studentName},\n\nWe received your payment. Your receipt ${p.receiptNo} is attached.\n\n${t.name}`,
          attachments: [{ filename: `${p.receiptNo}.pdf`, content: pdf, contentType: "application/pdf" }],
        });

        // At-least-once: if this update fails after a successful send, the receipt is sent again.
        await withTenant(db, t.id, (tx) =>
          tx
            .update(payments)
            .set({ receiptEmailedAt: new Date() })
            .where(and(eq(payments.id, p.paymentId), isNull(payments.receiptEmailedAt))),
        );
        sent++;
      } catch (e) {
        log.error(`receipt ${p.receiptNo} failed; will retry next run`, e);
      }
    }
  }
  if (sent > 0) log.info(`receipts: emailed ${sent}`);
}
