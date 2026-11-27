import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  attendance, batches, enrollments, liveClasses, liveParticipants, students, users,
  eq, and, asc, desc, inArray, sql, type Tx,
} from "@shiksha/db";
import { authenticate, type AuthContext } from "../../core/auth";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";
import { conflict, idParams } from "../../core/http";
import { studentIdOf } from "../../core/people";
import { requireBatchAccess, teacherBatchScope } from "../../core/batch-access";
import { env } from "../../env";
import { attendedEnough, dateInZone, roomName } from "./calc";
import { lk } from "./instance";
import { closeOpenForClass, touchJoin } from "./participants";

const staff = requireRole("admin", "teacher");
const student = requireRole("student");

const createBody = z.object({
  batchId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480),
});
const listQuery = z.object({
  batchId: z.string().uuid().optional(),
  status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional(),
});
const attendanceBody = z.object({ minMinutes: z.number().min(0).max(240).default(10) });

/** A class plus its batch name, visible only if the caller may see that batch. */
async function loadForStaff(tx: Tx, auth: AuthContext, id: string) {
  const [row] = await tx
    .select({ cls: liveClasses, batchName: batches.name })
    .from(liveClasses)
    .innerJoin(batches, eq(batches.id, liveClasses.batchId))
    .where(and(eq(liveClasses.id, id), teacherBatchScope(tx, auth)))
    .limit(1);
  if (!row) throw notFound("Class not found");
  return row;
}

export async function liveRoutes(app: FastifyInstance) {
  // ======================= Schedule =======================
  app.post("/live-classes", { preHandler: staff }, async (req, reply) => {
    const body = createBody.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const cls = await inTenant(req, async (tx) => {
      await requireBatchAccess(tx, req.auth!, body.batchId);
      const [c] = await tx
        .insert(liveClasses)
        .values({
          tenantId,
          batchId: body.batchId,
          title: body.title,
          scheduledAt: new Date(body.scheduledAt),
          durationMinutes: body.durationMinutes,
          createdBy: userId,
        })
        .returning();
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "live_class.create", entity: "live_class", entityId: c!.id, payload: { batchId: body.batchId },
      });
      return c;
    });
    return reply.status(201).send(cls);
  });

  app.get("/live-classes", { preHandler: staff }, async (req) => {
    const q = listQuery.parse(req.query);
    return inTenant(req, (tx) =>
      tx
        .select({
          id: liveClasses.id,
          title: liveClasses.title,
          batchId: liveClasses.batchId,
          batchName: batches.name,
          scheduledAt: liveClasses.scheduledAt,
          durationMinutes: liveClasses.durationMinutes,
          status: liveClasses.status,
          startedAt: liveClasses.startedAt,
          endedAt: liveClasses.endedAt,
          joined: sql<number>`(select count(*)::int from ${liveParticipants} p where p.live_class_id = ${liveClasses.id})`,
        })
        .from(liveClasses)
        .innerJoin(batches, eq(batches.id, liveClasses.batchId))
        .where(
          and(
            q.batchId ? eq(liveClasses.batchId, q.batchId) : undefined,
            q.status ? eq(liveClasses.status, q.status) : undefined,
            teacherBatchScope(tx, req.auth!),
          ),
        )
        .orderBy(desc(liveClasses.scheduledAt))
        .limit(100),
    );
  });

  app.get("/live-classes/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const { cls, batchName } = await loadForStaff(tx, req.auth!, id);

      const roster = await tx
        .select({
          studentId: students.id,
          name: users.name,
          rollNo: students.rollNo,
          firstJoinedAt: liveParticipants.firstJoinedAt,
          totalSeconds: liveParticipants.totalSeconds,
          joinCount: liveParticipants.joinCount,
        })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(liveParticipants, and(eq(liveParticipants.userId, students.userId), eq(liveParticipants.liveClassId, id)))
        .where(eq(enrollments.batchId, cls.batchId))
        .orderBy(asc(students.rollNo));

      const staffJoined = await tx
        .select({ name: users.name, firstJoinedAt: liveParticipants.firstJoinedAt, totalSeconds: liveParticipants.totalSeconds })
        .from(liveParticipants)
        .innerJoin(users, eq(users.id, liveParticipants.userId))
        .where(and(eq(liveParticipants.liveClassId, id), sql`${users.role} <> 'student'`));

      return { ...cls, batchName, roster, staffJoined };
    });
  });

  // ======================= Join (teacher join starts the class) =======================
  app.post("/live-classes/:id/join", { preHandler: authenticate }, async (req) => {
    const { id } = idParams.parse(req.params);
    const auth = req.auth!;
    const isStaff = auth.role !== "student";

    const { cls, name } = await inTenant(req, async (tx) => {
      const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, auth.userId)).limit(1);

      let cls: typeof liveClasses.$inferSelect;
      if (isStaff) {
        cls = (await loadForStaff(tx, auth, id)).cls;
        if (cls.status === "ended" || cls.status === "cancelled") throw conflict(`This class is ${cls.status}.`);
        if (cls.status === "scheduled") {
          const [started] = await tx
            .update(liveClasses)
            .set({ status: "live", startedAt: new Date() })
            .where(eq(liveClasses.id, id))
            .returning();
          cls = started!;
          await writeAudit(tx, auth.tenantId, { actorId: auth.userId, action: "live_class.start", entity: "live_class", entityId: id });
        }
      } else {
        const [row] = await tx.select().from(liveClasses).where(eq(liveClasses.id, id)).limit(1);
        if (!row) throw notFound("Class not found");
        const sid = await studentIdOf(tx, auth.userId);
        const [en] = await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.batchId, row.batchId), eq(enrollments.studentId, sid)))
          .limit(1);
        if (!en) throw notFound("Class not found");
        if (row.status === "scheduled") throw conflict("This class hasn't started yet.");
        if (row.status !== "live") throw conflict(`This class is ${row.status}.`);
        cls = row;
      }

      await touchJoin(tx, auth.tenantId, id, auth.userId);
      return { cls, name: u?.name ?? "Guest" };
    });

    const token = await lk.createJoinToken({
      room: roomName(auth.tenantId, id),
      identity: auth.userId,
      name,
      role: isStaff ? "teacher" : "student",
      canPublish: isStaff,
      ttlSeconds: Math.max(3600, (cls.durationMinutes + 120) * 60),
    });
    return {
      url: env.LIVEKIT_URL,
      token,
      role: isStaff ? "teacher" : "student",
      canPublish: isStaff,
      title: cls.title,
    };
  });

  // ======================= End / cancel =======================
  app.post("/live-classes/:id/end", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    await inTenant(req, async (tx) => {
      const { cls } = await loadForStaff(tx, req.auth!, id);
      if (cls.status !== "live") throw conflict("Only a live class can be ended.");
      await tx.update(liveClasses).set({ status: "ended", endedAt: new Date() }).where(eq(liveClasses.id, id));
      await closeOpenForClass(tx, id);
      await writeAudit(tx, tenantId, { actorId: userId, action: "live_class.end", entity: "live_class", entityId: id });
    });
    await lk.deleteRoom(roomName(tenantId, id));
    return { ok: true, status: "ended" };
  });

  app.post("/live-classes/:id/cancel", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const { cls } = await loadForStaff(tx, req.auth!, id);
      if (cls.status !== "scheduled") throw conflict("Only a class that hasn't started can be cancelled.");
      await tx.update(liveClasses).set({ status: "cancelled" }).where(eq(liveClasses.id, id));
      await writeAudit(tx, tenantId, { actorId: userId, action: "live_class.cancel", entity: "live_class", entityId: id });
      return { ok: true, status: "cancelled" };
    });
  });

  // ======================= Attendance from the class =======================
  app.post("/live-classes/:id/attendance", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { minMinutes } = attendanceBody.parse(req.body ?? {});
    const { tenantId, userId } = req.auth!;

    return inTenant(req, async (tx) => {
      const { cls } = await loadForStaff(tx, req.auth!, id);
      if (cls.status !== "ended") throw conflict("End the class before marking attendance.");

      const roster = await tx
        .select({ studentId: students.id, totalSeconds: liveParticipants.totalSeconds })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .leftJoin(liveParticipants, and(eq(liveParticipants.userId, students.userId), eq(liveParticipants.liveClassId, id)))
        .where(eq(enrollments.batchId, cls.batchId));

      const date = dateInZone(cls.startedAt ?? cls.scheduledAt, env.APP_TIMEZONE);
      const row = (studentId: string, status: "present" | "absent") => ({
        tenantId, batchId: cls.batchId, studentId, date, status, markedBy: userId,
      });
      const present = roster.filter((r) => attendedEnough(r.totalSeconds, minMinutes)).map((r) => row(r.studentId, "present"));
      const absent = roster.filter((r) => !attendedEnough(r.totalSeconds, minMinutes)).map((r) => row(r.studentId, "absent"));

      // A manual mark is never overwritten, except that "absent" is upgraded when the class shows they attended.
      if (present.length > 0) {
        await tx
          .insert(attendance)
          .values(present)
          .onConflictDoUpdate({
            target: [attendance.batchId, attendance.studentId, attendance.date],
            set: { status: "present", markedBy: userId },
            setWhere: sql`${attendance.status} = 'absent'`,
          });
      }
      if (absent.length > 0) await tx.insert(attendance).values(absent).onConflictDoNothing();

      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: "attendance.from_live_class",
        entity: "live_class",
        entityId: id,
        payload: { date, minMinutes, present: present.length, absent: absent.length },
      });
      return { date, present: present.length, absent: absent.length };
    });
  });

  // ======================= Student view =======================
  app.get("/me/live-classes", { preHandler: student }, async (req) =>
    inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      return tx
        .select({
          id: liveClasses.id,
          title: liveClasses.title,
          batchName: batches.name,
          scheduledAt: liveClasses.scheduledAt,
          durationMinutes: liveClasses.durationMinutes,
          status: liveClasses.status,
          attended: sql<boolean>`exists(select 1 from ${liveParticipants} p where p.live_class_id = ${liveClasses.id} and p.user_id = ${req.auth!.userId})`,
        })
        .from(liveClasses)
        .innerJoin(batches, eq(batches.id, liveClasses.batchId))
        .where(
          and(
            inArray(liveClasses.batchId, tx.select({ id: enrollments.batchId }).from(enrollments).where(eq(enrollments.studentId, sid))),
            sql`${liveClasses.status} <> 'cancelled'`,
          ),
        )
        .orderBy(desc(liveClasses.scheduledAt))
        .limit(50);
    }),
  );
}
