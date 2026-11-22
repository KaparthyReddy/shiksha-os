import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { renderReceipt } from "@shiksha/pdf";
import { invoices, payments, students, tenants, users, eq, and, sql, type Tx } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { notFound } from "../../core/errors";
import { studentIdOf } from "../../core/people";

const admin = requireRole("admin");
const student = requireRole("student");
const params = z.object({ receiptNo: z.string().regex(/^RCP-\d{4}-\d{6,}$/) });

async function loadReceipt(tx: Tx, tenantId: string, receiptNo: string, onlyStudentId?: string) {
  const [row] = await tx
    .select({
      receiptNo: payments.receiptNo,
      amountPaise: payments.amountPaise,
      method: payments.method,
      reference: payments.reference,
      receivedAt: payments.receivedAt,
      invoiceTotalPaise: invoices.amountPaise,
      paidThroughPaise: sql<number>`(select coalesce(sum(p2.amount_paise), 0)::float8 from payments p2 where p2.invoice_id = ${payments.invoiceId} and p2.received_at <= ${payments.receivedAt})`,
      studentName: users.name,
      rollNo: students.rollNo,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(eq(payments.receiptNo, receiptNo), onlyStudentId ? eq(students.id, onlyStudentId) : undefined))
    .limit(1);
  if (!row) throw notFound("Receipt not found");
  const [org] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return { row, orgName: org?.name ?? "" };
}

async function send(reply: FastifyReply, r: Awaited<ReturnType<typeof loadReceipt>>) {
  const pdf = await renderReceipt({
    orgName: r.orgName,
    receiptNo: r.row.receiptNo,
    receivedAt: r.row.receivedAt,
    studentName: r.row.studentName,
    rollNo: r.row.rollNo,
    method: r.row.method,
    reference: r.row.reference,
    amountPaise: r.row.amountPaise,
    invoiceTotalPaise: r.row.invoiceTotalPaise,
    balancePaise: r.row.invoiceTotalPaise - r.row.paidThroughPaise,
  });
  return reply
    .type("application/pdf")
    .header("content-disposition", `attachment; filename="${r.row.receiptNo}.pdf"`)
    .header("cache-control", "no-store")
    .send(pdf);
}

export async function receiptRoutes(app: FastifyInstance) {
  app.get("/receipts/:receiptNo/pdf", { preHandler: admin }, async (req, reply) => {
    const { receiptNo } = params.parse(req.params);
    const r = await inTenant(req, (tx) => loadReceipt(tx, req.auth!.tenantId, receiptNo));
    return send(reply, r);
  });

  // A student can only fetch a receipt for their own invoice; anything else is a 404.
  app.get("/me/receipts/:receiptNo/pdf", { preHandler: student }, async (req, reply) => {
    const { receiptNo } = params.parse(req.params);
    const r = await inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      return loadReceipt(tx, req.auth!.tenantId, receiptNo, sid);
    });
    return send(reply, r);
  });
}
