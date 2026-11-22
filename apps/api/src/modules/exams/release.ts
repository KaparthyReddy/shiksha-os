import type { FastifyInstance, FastifyRequest } from "fastify";
import { exams, eq } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";
import { idParams } from "../../core/http";

const staff = requireRole("admin", "teacher");

async function setReleased(req: FastifyRequest, value: boolean, action: string) {
  const { id } = idParams.parse(req.params);
  const { tenantId, userId } = req.auth!;
  return inTenant(req, async (tx) => {
    const done = await tx.update(exams).set({ resultsReleased: value }).where(eq(exams.id, id)).returning({ id: exams.id });
    if (done.length === 0) throw notFound("Exam not found");
    await writeAudit(tx, tenantId, { actorId: userId, action, entity: "exam", entityId: id });
    return { ok: true, released: value };
  });
}

export async function releaseRoutes(app: FastifyInstance) {
  app.post("/exams/:id/release-results", { preHandler: staff }, (req) => setReleased(req, true, "exam.release_results"));
  app.post("/exams/:id/hide-results", { preHandler: staff }, (req) => setReleased(req, false, "exam.hide_results"));
}
