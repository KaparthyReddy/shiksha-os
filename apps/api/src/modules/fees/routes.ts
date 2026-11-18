import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  INVOICE_STATUS,
  createFeePlanSchema,
  createInvoiceSchema,
  bulkInvoiceSchema,
  recordPaymentSchema,
} from "@shiksha/shared";
import {
  feePlans, invoices, payments, students, users, batches, enrollments,
  eq, and, inArray, desc, asc, sql, type Tx,
} from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";
import { idParams, pageQuery, conflict, likeTerm } from "../../core/http";
import { studentIdOf } from "../../core/people";
import { or, ilike } from "@shiksha/db";

const admin = requireRole("admin");
const student = requireRole("student");

const paidSql = () =>
  sql<number>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)::float8`;

const listQuery = pageQuery.extend({
  status: z.enum(INVOICE_STATUS).optional(),
  studentId: z.string().uuid().optional(),
});

const today = () => new Date().toISOString().slice(0, 10);

async function paidSoFar(tx: Tx, invoiceId: string): Promise<number> {
  const [r] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::float8` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return r?.paid ?? 0;
}

export async function feeRoutes(app: FastifyInstance) {
  // ======================= Fee plans =======================
  app.get("/fee-plans", { preHandler: admin }, async (req) =>
    inTenant(req, (tx) => tx.select().from(feePlans).orderBy(asc(feePlans.name))),
  );

  app.post("/fee-plans", { preHandler: admin }, async (req, reply) => {
    const body = createFeePlanSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const plan = await inTenant(req, async (tx) => {
      const [p] = await tx.insert(feePlans).values({ tenantId, ...body }).returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "fee_plan.create", entity: "fee_plan", entityId: p!.id,
        payload: { amountPaise: body.amountPaise },
      });
      return p;
    });
    return reply.status(201).send(plan);
  });

  // ======================= Invoices =======================
  app.post("/invoices", { preHandler: admin }, async (req, reply) => {
    const body = createInvoiceSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const invoice = await inTenant(req, async (tx) => {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, body.studentId)).limit(1);
      if (!s) throw notFound("Student not found");

      let amountPaise = body.amountPaise;
      if (body.feePlanId) {
        const [plan] = await tx.select().from(feePlans).where(eq(feePlans.id, body.feePlanId)).limit(1);
        if (!plan) throw notFound("Fee plan not found");
        amountPaise = amountPaise ?? plan.amountPaise;
      }
      const [inv] = await tx
        .insert(invoices)
        .values({ tenantId, studentId: body.studentId, feePlanId: body.feePlanId, amountPaise: amountPaise!, dueOn: body.dueOn })
        .returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "invoice.create", entity: "invoice", entityId: inv!.id,
        payload: { amountPaise },
      });
      return inv;
    });
    return reply.status(201).send(invoice);
  });

  // One invoice per enrolled student. Students who already have an invoice for this plan are skipped.
  app.post("/invoices/bulk", { preHandler: admin }, async (req) => {
    const body = bulkInvoiceSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [plan] = await tx.select().from(feePlans).where(eq(feePlans.id, body.feePlanId)).limit(1);
      if (!plan) throw notFound("Fee plan not found");
      const [b] = await tx.select({ id: batches.id }).from(batches).where(eq(batches.id, body.batchId)).limit(1);
      if (!b) throw notFound("Batch not found");

      const roster = await tx
        .select({ id: enrollments.studentId })
        .from(enrollments)
        .where(eq(enrollments.batchId, body.batchId));
      const ids = roster.map((r) => r.id);
      if (ids.length === 0) return { created: 0, skipped: 0 };

      const existing = await tx
        .select({ studentId: invoices.studentId })
        .from(invoices)
        .where(and(eq(invoices.feePlanId, plan.id), inArray(invoices.studentId, ids)));
      const have = new Set(existing.map((e) => e.studentId));

      const rows = ids
        .filter((id) => !have.has(id))
        .map((studentId) => ({
          tenantId, studentId, feePlanId: plan.id, amountPaise: plan.amountPaise, dueOn: body.dueOn,
        }));
      if (rows.length > 0) await tx.insert(invoices).values(rows);

      await writeAudit(tx, tenantId, {
        actorId: userId, action: "invoice.bulk_create", entity: "batch", entityId: body.batchId,
        payload: { feePlanId: plan.id, created: rows.length },
      });
      return { created: rows.length, skipped: ids.length - rows.length };
    });
  });

  app.get("/invoices", { preHandler: admin }, async (req) => {
    const { page, pageSize, q, status, studentId } = listQuery.parse(req.query);
    return inTenant(req, async (tx) => {
      const where = and(
        status ? eq(invoices.status, status) : undefined,
        studentId ? eq(invoices.studentId, studentId) : undefined,
        q ? or(ilike(users.name, likeTerm(q)), ilike(students.rollNo, likeTerm(q))) : undefined,
      );
      const rows = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          studentName: users.name,
          rollNo: students.rollNo,
          feePlanId: invoices.feePlanId,
          amountPaise: invoices.amountPaise,
          paidPaise: paidSql(),
          dueOn: invoices.dueOn,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(where)
        .orderBy(desc(invoices.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [t] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(where);

      const now = today();
      const items = rows.map((r) => ({
        ...r,
        outstandingPaise: r.amountPaise - r.paidPaise,
        overdue: !!r.dueOn && r.dueOn < now && (r.status === "pending" || r.status === "partial"),
      }));
      return { items, total: t?.total ?? 0, page, pageSize };
    });
  });

  app.get("/invoices/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          studentName: users.name,
          rollNo: students.rollNo,
          amountPaise: invoices.amountPaise,
          dueOn: invoices.dueOn,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(eq(invoices.id, id))
        .limit(1);
      if (!inv) throw notFound("Invoice not found");
      const pays = await tx.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.receivedAt));
      const paid = pays.reduce((s, p) => s + p.amountPaise, 0);
      return { ...inv, paidPaise: paid, outstandingPaise: inv.amountPaise - paid, payments: pays };
    });
  });

  app.post("/invoices/:id/payments", { preHandler: admin }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = recordPaymentSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;

    const result = await inTenant(req, async (tx) => {
      // Lock the invoice so two cashiers can't both pay the last rupee.
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
      if (!inv) throw notFound("Invoice not found");
      if (inv.status === "void") throw conflict("This invoice is void");
      if (inv.status === "paid") throw conflict("This invoice is already fully paid");

      const paid = await paidSoFar(tx, id);
      const outstanding = inv.amountPaise - paid;
      if (body.amountPaise > outstanding) {
        throw conflict(`Payment exceeds the outstanding balance (${outstanding} paise)`);
      }

      // Receipt numbers are sequential per tenant; the advisory lock keeps them gap-free under concurrency.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"receipt:" + tenantId}))`);
      const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments);
      const receiptNo = `RCP-${new Date().getFullYear()}-${String((c?.n ?? 0) + 1).padStart(6, "0")}`;

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId,
          invoiceId: id,
          amountPaise: body.amountPaise,
          method: body.method,
          reference: body.reference,
          receiptNo,
          receivedBy: userId,
        })
        .returning();

      const status = paid + body.amountPaise >= inv.amountPaise ? "paid" : "partial";
      await tx.update(invoices).set({ status }).where(eq(invoices.id, id));

      await writeAudit(tx, tenantId, {
        actorId: userId, action: "payment.record", entity: "invoice", entityId: id,
        payload: { amountPaise: body.amountPaise, method: body.method, receiptNo },
      });
      return { payment, status, outstandingPaise: outstanding - body.amountPaise };
    });
    return reply.status(201).send(result);
  });

  app.post("/invoices/:id/void", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
      if (!inv) throw notFound("Invoice not found");
      if (inv.status === "void") throw conflict("This invoice is already void");
      if ((await paidSoFar(tx, id)) > 0) throw conflict("Invoices with payments can't be voided (refunds come later)");
      await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, id));
      await writeAudit(tx, tenantId, { actorId: userId, action: "invoice.void", entity: "invoice", entityId: id });
      return { ok: true };
    });
  });

  // ======================= Dashboard + student view =======================
  app.get("/fees/summary", { preHandler: admin }, async (req) =>
    inTenant(req, async (tx) => {
      const [inv] = await tx
        .select({
          invoicedPaise: sql<number>`coalesce(sum(${invoices.amountPaise}) filter (where ${invoices.status} <> 'void'), 0)::float8`,
          overdueCount: sql<number>`count(*) filter (where ${invoices.status} in ('pending','partial') and ${invoices.dueOn} < current_date)::int`,
        })
        .from(invoices);
      const [pay] = await tx
        .select({ collectedPaise: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::float8` })
        .from(payments);
      const invoiced = inv?.invoicedPaise ?? 0;
      const collected = pay?.collectedPaise ?? 0;
      return {
        invoicedPaise: invoiced,
        collectedPaise: collected,
        pendingPaise: invoiced - collected,
        overdueCount: inv?.overdueCount ?? 0,
      };
    }),
  );

  app.get("/me/invoices", { preHandler: student }, async (req) =>
    inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const invs = await tx
        .select({
          id: invoices.id,
          amountPaise: invoices.amountPaise,
          paidPaise: paidSql(),
          dueOn: invoices.dueOn,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.studentId, sid))
        .orderBy(desc(invoices.createdAt));
      const ids = invs.map((i) => i.id);
      const pays = ids.length
        ? await tx
            .select({
              invoiceId: payments.invoiceId,
              amountPaise: payments.amountPaise,
              method: payments.method,
              receiptNo: payments.receiptNo,
              receivedAt: payments.receivedAt,
            })
            .from(payments)
            .where(inArray(payments.invoiceId, ids))
            .orderBy(asc(payments.receivedAt))
        : [];
      return invs.map((i) => ({
        ...i,
        outstandingPaise: i.amountPaise - i.paidPaise,
        payments: pays.filter((p) => p.invoiceId === i.id),
      }));
    }),
  );
}
