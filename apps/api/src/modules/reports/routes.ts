import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { renderReportCard, type ReportCardData } from "@shiksha/pdf";
import { batches, enrollments, and, eq, inArray, type Tx } from "@shiksha/db";
import type { AuthContext } from "../../core/auth";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { notFound } from "../../core/errors";
import { idParams } from "../../core/http";
import { studentIdOf } from "../../core/people";
import { teacherBatchScope } from "../../core/batch-access";
import { loadReportCard } from "./service";

const staff = requireRole("admin", "teacher");
const student = requireRole("student");
const remarkQuery = z.object({ remark: z.string().trim().max(300).optional() });

/** Teachers may only see students in batches they are assigned to. */
async function requireStudentAccess(tx: Tx, auth: AuthContext, studentId: string) {
  if (auth.role !== "teacher") return;
  const [ok] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.studentId, studentId),
        inArray(enrollments.batchId, tx.select({ id: batches.id }).from(batches).where(teacherBatchScope(tx, auth))),
      ),
    )
    .limit(1);
  if (!ok) throw notFound("Student not found");
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "student";

async function sendPdf(reply: FastifyReply, data: Omit<ReportCardData, "generatedAt" | "remark">, remark?: string) {
  const pdf = await renderReportCard({ ...data, generatedAt: new Date(), remark });
  return reply
    .type("application/pdf")
    .header("content-disposition", `attachment; filename="report-card-${safeName(data.rollNo)}.pdf"`)
    .header("cache-control", "no-store")
    .send(pdf);
}

export async function reportRoutes(app: FastifyInstance) {
  const forStaff = async (req: Parameters<typeof inTenant>[0], studentId: string) => {
    const data = await inTenant(req, async (tx) => {
      await requireStudentAccess(tx, req.auth!, studentId);
      return loadReportCard(tx, req.auth!.tenantId, studentId);
    });
    if (!data) throw notFound("Student not found");
    return data;
  };

  app.get("/students/:id/report-card", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return forStaff(req, id);
  });

  app.get("/students/:id/report-card.pdf", { preHandler: staff }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { remark } = remarkQuery.parse(req.query);
    return sendPdf(reply, await forStaff(req, id), remark);
  });

  const forSelf = async (req: Parameters<typeof inTenant>[0]) => {
    const data = await inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      return loadReportCard(tx, req.auth!.tenantId, sid);
    });
    if (!data) throw notFound("Student not found");
    return data;
  };

  app.get("/me/report-card", { preHandler: student }, async (req) => forSelf(req));
  app.get("/me/report-card.pdf", { preHandler: student }, async (req, reply) => sendPdf(reply, await forSelf(req)));
}
