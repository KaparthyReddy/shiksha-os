import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCourseSchema,
  updateCourseSchema,
  createBatchSchema,
  updateBatchSchema,
  enrollSchema,
} from "@shiksha/shared";
import { courses, batches, students, users, enrollments, eq, and, asc, sql } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound, badRequest } from "../../core/errors";
import { idParams, conflict, rethrowUnique } from "../../core/http";
import { enrollStudent } from "./enroll";

const staff = requireRole("admin", "teacher");
const admin = requireRole("admin");

export async function academicsRoutes(app: FastifyInstance) {
  // ======================= Courses =======================
  app.get("/courses", { preHandler: staff }, async (req) =>
    inTenant(req, (tx) =>
      tx
        .select({
          id: courses.id,
          name: courses.name,
          code: courses.code,
          createdAt: courses.createdAt,
          batchCount: sql<number>`count(${batches.id})::int`,
        })
        .from(courses)
        .leftJoin(batches, eq(batches.courseId, courses.id))
        .groupBy(courses.id)
        .orderBy(asc(courses.name)),
    ),
  );

  app.post("/courses", { preHandler: admin }, async (req, reply) => {
    const body = createCourseSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    try {
      const course = await inTenant(req, async (tx) => {
        const [c] = await tx.insert(courses).values({ tenantId, ...body }).returning();
        await writeAudit(tx, tenantId, {
          actorId: userId, action: "course.create", entity: "course", entityId: c!.id, payload: { code: body.code },
        });
        return c;
      });
      return reply.status(201).send(course);
    } catch (e) {
      rethrowUnique(e, "A course with this code already exists");
    }
  });

  app.patch("/courses/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateCourseSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");
    const { tenantId, userId } = req.auth!;
    try {
      return await inTenant(req, async (tx) => {
        const [c] = await tx.update(courses).set(body).where(eq(courses.id, id)).returning();
        if (!c) throw notFound("Course not found");
        await writeAudit(tx, tenantId, {
          actorId: userId, action: "course.update", entity: "course", entityId: id, payload: { fields: Object.keys(body) },
        });
        return c;
      });
    } catch (e) {
      rethrowUnique(e, "A course with this code already exists");
    }
  });

  app.delete("/courses/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(batches)
        .where(eq(batches.courseId, id));
      if ((n?.n ?? 0) > 0) throw conflict("Delete or move this course's batches first");
      const [c] = await tx.delete(courses).where(eq(courses.id, id)).returning({ id: courses.id });
      if (!c) throw notFound("Course not found");
      await writeAudit(tx, tenantId, { actorId: userId, action: "course.delete", entity: "course", entityId: id });
      return { ok: true };
    });
  });

  // ======================= Batches =======================
  const batchListQuery = z.object({ courseId: z.string().uuid().optional() });

  app.get("/batches", { preHandler: staff }, async (req) => {
    const { courseId } = batchListQuery.parse(req.query);
    return inTenant(req, (tx) =>
      tx
        .select({
          id: batches.id,
          name: batches.name,
          courseId: batches.courseId,
          courseName: courses.name,
          startsOn: batches.startsOn,
          endsOn: batches.endsOn,
          capacity: batches.capacity,
          enrolled: sql<number>`count(${enrollments.id})::int`,
        })
        .from(batches)
        .innerJoin(courses, eq(courses.id, batches.courseId))
        .leftJoin(enrollments, eq(enrollments.batchId, batches.id))
        .where(courseId ? eq(batches.courseId, courseId) : undefined)
        .groupBy(batches.id, courses.id)
        .orderBy(asc(batches.name)),
    );
  });

  app.get("/batches/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const [b] = await tx
        .select({
          id: batches.id,
          name: batches.name,
          courseId: batches.courseId,
          courseName: courses.name,
          startsOn: batches.startsOn,
          endsOn: batches.endsOn,
          capacity: batches.capacity,
        })
        .from(batches)
        .innerJoin(courses, eq(courses.id, batches.courseId))
        .where(eq(batches.id, id))
        .limit(1);
      if (!b) throw notFound("Batch not found");

      const roster = await tx
        .select({
          studentId: students.id,
          name: users.name,
          rollNo: students.rollNo,
          enrolledAt: enrollments.enrolledAt,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(eq(enrollments.batchId, id))
        .orderBy(asc(students.rollNo));

      return { ...b, enrolled: roster.length, students: roster };
    });
  });

  app.post("/batches", { preHandler: admin }, async (req, reply) => {
    const body = createBatchSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const batch = await inTenant(req, async (tx) => {
      // FK checks bypass RLS, so verify the course belongs to this tenant explicitly.
      const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, body.courseId)).limit(1);
      if (!course) throw notFound("Course not found");
      const [b] = await tx.insert(batches).values({ tenantId, ...body }).returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "batch.create", entity: "batch", entityId: b!.id, payload: { courseId: body.courseId },
      });
      return b;
    });
    return reply.status(201).send(batch);
  });

  app.patch("/batches/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateBatchSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [existing] = await tx.select().from(batches).where(eq(batches.id, id)).limit(1);
      if (!existing) throw notFound("Batch not found");

      const startsOn = body.startsOn === undefined ? existing.startsOn : body.startsOn;
      const endsOn = body.endsOn === undefined ? existing.endsOn : body.endsOn;
      if (startsOn && endsOn && startsOn > endsOn) throw badRequest("endsOn must be on or after startsOn");

      if (body.capacity != null) {
        const [c] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(eq(enrollments.batchId, id));
        if ((c?.n ?? 0) > body.capacity) throw conflict(`Batch already has ${c!.n} students enrolled`);
      }

      const [b] = await tx.update(batches).set(body).where(eq(batches.id, id)).returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "batch.update", entity: "batch", entityId: id, payload: { fields: Object.keys(body) },
      });
      return b;
    });
  });

  app.delete("/batches/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [c] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(enrollments)
        .where(eq(enrollments.batchId, id));
      if ((c?.n ?? 0) > 0) throw conflict("Unenroll all students before deleting this batch");
      const [b] = await tx.delete(batches).where(eq(batches.id, id)).returning({ id: batches.id });
      if (!b) throw notFound("Batch not found");
      await writeAudit(tx, tenantId, { actorId: userId, action: "batch.delete", entity: "batch", entityId: id });
      return { ok: true };
    });
  });

  // ======================= Enrollments =======================
  app.post("/batches/:id/enrollments", { preHandler: admin }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { studentId } = enrollSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    try {
      await inTenant(req, async (tx) => {
        const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
        if (!s) throw notFound("Student not found");
        await enrollStudent(tx, tenantId, id, studentId);
        await writeAudit(tx, tenantId, {
          actorId: userId, action: "enrollment.create", entity: "batch", entityId: id, payload: { studentId },
        });
      });
      return reply.status(201).send({ ok: true });
    } catch (e) {
      rethrowUnique(e, "Student is already enrolled in this batch");
    }
  });

  app.delete("/batches/:id/enrollments/:studentId", { preHandler: admin }, async (req) => {
    const { id, studentId } = z
      .object({ id: z.string().uuid(), studentId: z.string().uuid() })
      .parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const gone = await tx
        .delete(enrollments)
        .where(and(eq(enrollments.batchId, id), eq(enrollments.studentId, studentId)))
        .returning({ id: enrollments.id });
      if (gone.length === 0) throw notFound("Enrollment not found");
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "enrollment.delete", entity: "batch", entityId: id, payload: { studentId },
      });
      return { ok: true };
    });
  });
}
