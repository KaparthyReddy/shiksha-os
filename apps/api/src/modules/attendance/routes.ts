import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { markAttendanceSchema } from "@shiksha/shared";
import { attendance, batches, enrollments, students, users, eq, and, inArray, asc, desc, sql, type Tx } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound, badRequest } from "../../core/errors";
import { studentIdOf } from "../../core/people";
import { requireBatchAccess } from "../../core/batch-access";
import type { AuthContext } from "../../core/auth";

const staff = requireRole("admin", "teacher");
const student = requireRole("student");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Late counts as attended; excused days are left out of the denominator. */
function percentage(present: number, late: number, absent: number): number | null {
  const denom = present + late + absent;
  return denom === 0 ? null : Math.round(((present + late) / denom) * 1000) / 10;
}

async function requireBatch(tx: Tx, auth: AuthContext, batchId: string) {
  await requireBatchAccess(tx, auth, batchId);
}

export async function attendanceRoutes(app: FastifyInstance) {
  app.put("/attendance", { preHandler: staff }, async (req) => {
    const body = markAttendanceSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;

    // One day of slack for timezones, but no marking attendance far in the future.
    const latest = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
    if (body.date > latest) throw badRequest("Date is in the future");

    return inTenant(req, async (tx) => {
      await requireBatch(tx, req.auth!, body.batchId);

      const ids = body.records.map((r) => r.studentId);
      const enrolled = await tx
        .select({ id: enrollments.studentId })
        .from(enrollments)
        .where(and(eq(enrollments.batchId, body.batchId), inArray(enrollments.studentId, ids)));
      if (enrolled.length !== ids.length) throw badRequest("Some students are not enrolled in this batch");

      await tx
        .insert(attendance)
        .values(
          body.records.map((r) => ({
            tenantId,
            batchId: body.batchId,
            studentId: r.studentId,
            date: body.date,
            status: r.status,
            markedBy: userId,
          })),
        )
        .onConflictDoUpdate({
          target: [attendance.batchId, attendance.studentId, attendance.date],
          set: { status: sql`excluded.status`, markedBy: sql`excluded.marked_by` },
        });

      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: "attendance.mark",
        entity: "batch",
        entityId: body.batchId,
        payload: {
          date: body.date,
          count: body.records.length,
          absent: body.records.filter((r) => r.status === "absent").length,
        },
      });
      return { saved: body.records.length };
    });
  });

  // Roster for one batch and day. status is null for students not yet marked.
  app.get("/attendance", { preHandler: staff }, async (req) => {
    const { batchId, date } = z.object({ batchId: z.string().uuid(), date: dateStr }).parse(req.query);
    return inTenant(req, async (tx) => {
      await requireBatch(tx, req.auth!, batchId);
      return tx
        .select({
          studentId: students.id,
          name: users.name,
          rollNo: students.rollNo,
          status: attendance.status,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(
          attendance,
          and(
            eq(attendance.studentId, students.id),
            eq(attendance.batchId, batchId),
            eq(attendance.date, date),
          ),
        )
        .where(eq(enrollments.batchId, batchId))
        .orderBy(asc(students.rollNo));
    });
  });

  app.get("/attendance/summary", { preHandler: staff }, async (req) => {
    const q = z
      .object({ batchId: z.string().uuid(), from: dateStr.optional(), to: dateStr.optional() })
      .parse(req.query);
    return inTenant(req, async (tx) => {
      await requireBatch(tx, req.auth!, q.batchId);
      const rows = await tx
        .select({
          studentId: students.id,
          name: users.name,
          rollNo: students.rollNo,
          present: sql<number>`count(*) filter (where ${attendance.status} = 'present')::int`,
          late: sql<number>`count(*) filter (where ${attendance.status} = 'late')::int`,
          absent: sql<number>`count(*) filter (where ${attendance.status} = 'absent')::int`,
          excused: sql<number>`count(*) filter (where ${attendance.status} = 'excused')::int`,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(
          attendance,
          and(
            eq(attendance.studentId, students.id),
            eq(attendance.batchId, q.batchId),
            q.from ? sql`${attendance.date} >= ${q.from}` : undefined,
            q.to ? sql`${attendance.date} <= ${q.to}` : undefined,
          ),
        )
        .where(eq(enrollments.batchId, q.batchId))
        .groupBy(students.id, users.id)
        .orderBy(asc(students.rollNo));

      return rows.map((r) => {
        const pct = percentage(r.present, r.late, r.absent);
        return { ...r, percentage: pct, belowThreshold: pct !== null && pct < 75 };
      });
    });
  });

  app.get("/me/attendance", { preHandler: student }, async (req) =>
    inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const rows = await tx
        .select({ date: attendance.date, status: attendance.status, batchName: batches.name })
        .from(attendance)
        .innerJoin(batches, eq(batches.id, attendance.batchId))
        .where(eq(attendance.studentId, sid))
        .orderBy(desc(attendance.date));
      const n = (s: string) => rows.filter((r) => r.status === s).length;
      const present = n("present"), late = n("late"), absent = n("absent"), excused = n("excused");
      return {
        summary: { present, late, absent, excused, percentage: percentage(present, late, absent) },
        recent: rows.slice(0, 30),
      };
    }),
  );
}
