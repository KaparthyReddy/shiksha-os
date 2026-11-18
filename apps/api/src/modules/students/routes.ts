import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createStudentSchema, updateStudentSchema } from "@shiksha/shared";
import {
  students, users, batches, courses, enrollments,
  eq, and, or, ilike, inArray, sql, asc,
} from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound, badRequest } from "../../core/errors";
import { idParams, pageQuery, likeTerm, rethrowUnique } from "../../core/http";
import { generateTempPassword, hashPassword } from "../../core/passwords";
import { enrollStudent } from "../academics/enroll";

const staff = requireRole("admin", "teacher");
const admin = requireRole("admin");

const listQuery = pageQuery.extend({ batchId: z.string().uuid().optional() });

const studentCols = {
  id: students.id,
  userId: students.userId,
  name: users.name,
  email: users.email,
  rollNo: students.rollNo,
  guardianName: students.guardianName,
  guardianPhone: students.guardianPhone,
  isActive: users.isActive,
  createdAt: students.createdAt,
};

export async function studentRoutes(app: FastifyInstance) {
  app.get("/students", { preHandler: staff }, async (req) => {
    const { page, pageSize, q, batchId } = listQuery.parse(req.query);
    return inTenant(req, async (tx) => {
      const where = and(
        q
          ? or(
              ilike(users.name, likeTerm(q)),
              ilike(users.email, likeTerm(q)),
              ilike(students.rollNo, likeTerm(q)),
            )
          : undefined,
        batchId
          ? inArray(
              students.id,
              tx.select({ id: enrollments.studentId }).from(enrollments).where(eq(enrollments.batchId, batchId)),
            )
          : undefined,
      );

      const items = await tx
        .select(studentCols)
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(where)
        .orderBy(asc(students.rollNo))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [row] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(where);

      return { items, total: row?.total ?? 0, page, pageSize };
    });
  });

  app.get("/students/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const [s] = await tx
        .select(studentCols)
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(eq(students.id, id))
        .limit(1);
      if (!s) throw notFound("Student not found");

      const bs = await tx
        .select({ batchId: batches.id, batchName: batches.name, courseName: courses.name })
        .from(enrollments)
        .innerJoin(batches, eq(batches.id, enrollments.batchId))
        .innerJoin(courses, eq(courses.id, batches.courseId))
        .where(eq(enrollments.studentId, id));

      return { ...s, batches: bs };
    });
  });

  app.post("/students", { preHandler: admin }, async (req, reply) => {
    const body = createStudentSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const temporaryPassword = generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    try {
      const student = await inTenant(req, async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ tenantId, email: body.email, passwordHash, name: body.name, role: "student" })
          .returning({ id: users.id });

        const [s] = await tx
          .insert(students)
          .values({
            tenantId,
            userId: u!.id,
            rollNo: body.rollNo,
            guardianName: body.guardianName,
            guardianPhone: body.guardianPhone,
          })
          .returning();

        if (body.batchId) await enrollStudent(tx, tenantId, body.batchId, s!.id);

        await writeAudit(tx, tenantId, {
          actorId: userId,
          action: "student.create",
          entity: "student",
          entityId: s!.id,
          payload: { rollNo: body.rollNo, batchId: body.batchId ?? null },
        });
        return { id: s!.id, userId: u!.id, name: body.name, email: body.email, rollNo: s!.rollNo };
      });

      // The temporary password is shown exactly once. Only its hash is stored.
      return reply.status(201).send({ student, temporaryPassword });
    } catch (e) {
      rethrowUnique(e, "A user with this email or roll number already exists");
    }
  });

  app.patch("/students/:id", { preHandler: admin }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateStudentSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");
    const { tenantId, userId } = req.auth!;

    try {
      return await inTenant(req, async (tx) => {
        const [s] = await tx
          .select({ userId: students.userId })
          .from(students)
          .where(eq(students.id, id))
          .limit(1);
        if (!s) throw notFound("Student not found");

        const { name, isActive, rollNo, guardianName, guardianPhone } = body;
        if (name !== undefined || isActive !== undefined) {
          await tx.update(users).set({ name, isActive }).where(eq(users.id, s.userId));
        }
        if (rollNo !== undefined || guardianName !== undefined || guardianPhone !== undefined) {
          await tx.update(students).set({ rollNo, guardianName, guardianPhone }).where(eq(students.id, id));
        }

        await writeAudit(tx, tenantId, {
          actorId: userId,
          action: body.isActive === false ? "student.deactivate" : "student.update",
          entity: "student",
          entityId: id,
          payload: { fields: Object.keys(body) },
        });
        return { ok: true };
      });
    } catch (e) {
      rethrowUnique(e, "Roll number already in use");
    }
  });
}
