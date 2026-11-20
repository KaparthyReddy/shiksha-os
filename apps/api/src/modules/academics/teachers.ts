import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { batchTeachers, faculty, users, eq, and, asc } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";
import { idParams, conflict, rethrowUnique } from "../../core/http";
import { requireBatchAccess } from "../../core/batch-access";

const staff = requireRole("admin", "teacher");
const admin = requireRole("admin");

export async function teacherAssignmentRoutes(app: FastifyInstance) {
  app.get("/batches/:id/teachers", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      await requireBatchAccess(tx, req.auth!, id);
      return tx
        .select({
          facultyId: faculty.id,
          name: users.name,
          email: users.email,
          designation: faculty.designation,
        })
        .from(batchTeachers)
        .innerJoin(faculty, eq(faculty.id, batchTeachers.facultyId))
        .innerJoin(users, eq(users.id, faculty.userId))
        .where(eq(batchTeachers.batchId, id))
        .orderBy(asc(users.name));
    });
  });

  app.post("/batches/:id/teachers", { preHandler: admin }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { facultyId } = z.object({ facultyId: z.string().uuid() }).parse(req.body);
    const { tenantId, userId } = req.auth!;
    try {
      await inTenant(req, async (tx) => {
        await requireBatchAccess(tx, req.auth!, id);
        const [f] = await tx
          .select({ id: faculty.id, active: users.isActive })
          .from(faculty)
          .innerJoin(users, eq(users.id, faculty.userId))
          .where(eq(faculty.id, facultyId))
          .limit(1);
        if (!f) throw notFound("Faculty member not found");
        if (!f.active) throw conflict("This faculty member is deactivated");
        await tx.insert(batchTeachers).values({ tenantId, batchId: id, facultyId });
        await writeAudit(tx, tenantId, {
          actorId: userId, action: "batch.teacher_assign", entity: "batch", entityId: id, payload: { facultyId },
        });
      });
      return reply.status(201).send({ ok: true });
    } catch (e) {
      rethrowUnique(e, "This teacher is already assigned to the batch");
    }
  });

  app.delete("/batches/:id/teachers/:facultyId", { preHandler: admin }, async (req) => {
    const { id, facultyId } = z
      .object({ id: z.string().uuid(), facultyId: z.string().uuid() })
      .parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const gone = await tx
        .delete(batchTeachers)
        .where(and(eq(batchTeachers.batchId, id), eq(batchTeachers.facultyId, facultyId)))
        .returning({ id: batchTeachers.id });
      if (gone.length === 0) throw notFound("Assignment not found");
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "batch.teacher_unassign", entity: "batch", entityId: id, payload: { facultyId },
      });
      return { ok: true };
    });
  });
}
