import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createExamSchema, EXAM_STATUS } from "@shiksha/shared";
import {
  exams, examQuestions, examSessions, examAnswers, questions, batches, students, users,
  eq, and, inArray, ilike, desc, asc, sql,
} from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound, badRequest } from "../../core/errors";
import { idParams, pageQuery, conflict, likeTerm } from "../../core/http";
import { expireOverdue } from "./service";
import { requireBatchAccess } from "../../core/batch-access";

const staff = requireRole("admin", "teacher");
const listQuery = pageQuery.extend({ status: z.enum(EXAM_STATUS).optional() });

export async function examRoutes(app: FastifyInstance) {
  app.post("/exams", { preHandler: staff }, async (req, reply) => {
    const body = createExamSchema.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const exam = await inTenant(req, async (tx) => {
      if (body.batchId) await requireBatchAccess(tx, req.auth!, body.batchId);
      // FK checks bypass RLS, so confirm every question belongs to this tenant.
      const found = await tx.select({ id: questions.id }).from(questions).where(inArray(questions.id, body.questionIds));
      if (found.length !== body.questionIds.length) throw badRequest("One or more questions were not found");

      const [e] = await tx
        .insert(exams)
        .values({
          tenantId,
          title: body.title,
          batchId: body.batchId,
          durationMinutes: body.durationMinutes,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          shuffle: body.shuffle,
          resultsReleased: body.releaseResults,
          createdBy: userId,
        })
        .returning();
      await tx.insert(examQuestions).values(
        body.questionIds.map((questionId, i) => ({ tenantId, examId: e!.id, questionId, position: i + 1 })),
      );
      await writeAudit(tx, tenantId, {
        actorId: userId, action: "exam.create", entity: "exam", entityId: e!.id,
        payload: { questions: body.questionIds.length },
      });
      return e;
    });
    return reply.status(201).send(exam);
  });

  app.get("/exams", { preHandler: staff }, async (req) => {
    const { page, pageSize, q, status } = listQuery.parse(req.query);
    return inTenant(req, async (tx) => {
      const where = and(status ? eq(exams.status, status) : undefined, q ? ilike(exams.title, likeTerm(q)) : undefined);
      const items = await tx
        .select({
          id: exams.id,
          title: exams.title,
          status: exams.status,
          batchId: exams.batchId,
          durationMinutes: exams.durationMinutes,
          startsAt: exams.startsAt,
          endsAt: exams.endsAt,
          createdAt: exams.createdAt,
          questionCount: sql<number>`(select count(*)::int from ${examQuestions} x where x.exam_id = ${exams.id})`,
          attempts: sql<number>`(select count(*)::int from ${examSessions} y where y.exam_id = ${exams.id})`,
        })
        .from(exams)
        .where(where)
        .orderBy(desc(exams.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(exams).where(where);
      return { items, total: row?.total ?? 0, page, pageSize };
    });
  });

  app.get("/exams/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const [exam] = await tx.select().from(exams).where(eq(exams.id, id)).limit(1);
      if (!exam) throw notFound("Exam not found");
      const qs = await tx
        .select({
          id: questions.id,
          position: examQuestions.position,
          subject: questions.subject,
          type: questions.type,
          body: questions.body,
          options: questions.options,
          correct: questions.correct,
          marks: questions.marks,
          negativeMarks: questions.negativeMarks,
        })
        .from(examQuestions)
        .innerJoin(questions, eq(questions.id, examQuestions.questionId))
        .where(eq(examQuestions.examId, id))
        .orderBy(asc(examQuestions.position));
      return { ...exam, questions: qs };
    });
  });

  app.post("/exams/:id/publish", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [e] = await tx.select().from(exams).where(eq(exams.id, id)).for("update");
      if (!e) throw notFound("Exam not found");
      if (e.status !== "draft") throw conflict("Only draft exams can be published");
      if (e.endsAt && e.endsAt.getTime() <= Date.now()) throw badRequest("endsAt is already in the past");
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(examQuestions)
        .where(eq(examQuestions.examId, id));
      if ((n?.n ?? 0) === 0) throw badRequest("Add at least one question first");
      const [out] = await tx.update(exams).set({ status: "published" }).where(eq(exams.id, id)).returning();
      await writeAudit(tx, tenantId, { actorId: userId, action: "exam.publish", entity: "exam", entityId: id });
      return out;
    });
  });

  // Closing stops new starts. Students already mid-exam keep their personal deadline.
  app.post("/exams/:id/close", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [e] = await tx.select().from(exams).where(eq(exams.id, id)).for("update");
      if (!e) throw notFound("Exam not found");
      if (e.status !== "published") throw conflict("Only published exams can be closed");
      const [out] = await tx.update(exams).set({ status: "closed" }).where(eq(exams.id, id)).returning();
      await writeAudit(tx, tenantId, { actorId: userId, action: "exam.close", entity: "exam", entityId: id });
      return out;
    });
  });

  app.delete("/exams/:id", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [e] = await tx.select().from(exams).where(eq(exams.id, id)).for("update");
      if (!e) throw notFound("Exam not found");
      if (e.status !== "draft") throw conflict("Only draft exams can be deleted");
      await tx.delete(exams).where(eq(exams.id, id));
      await writeAudit(tx, tenantId, { actorId: userId, action: "exam.delete", entity: "exam", entityId: id });
      return { ok: true };
    });
  });

  app.get("/exams/:id/results", { preHandler: staff }, async (req) => {
    const { id } = idParams.parse(req.params);
    return inTenant(req, async (tx) => {
      const [exam] = await tx.select().from(exams).where(eq(exams.id, id)).limit(1);
      if (!exam) throw notFound("Exam not found");

      await expireOverdue(tx, Date.now(), id);

      const [m] = await tx
        .select({ maxScore: sql<number>`coalesce(sum(${questions.marks}), 0)::float8` })
        .from(examQuestions)
        .innerJoin(questions, eq(questions.id, examQuestions.questionId))
        .where(eq(examQuestions.examId, id));

      const rows = await tx
        .select({
          sessionId: examSessions.id,
          studentId: students.id,
          name: users.name,
          rollNo: students.rollNo,
          status: examSessions.status,
          score: examSessions.score,
          startedAt: examSessions.startedAt,
          submittedAt: examSessions.submittedAt,
          lateAnswers: sql<number>`(select count(*)::int from ${examAnswers} a where a.session_id = ${examSessions.id} and a.late)`,
        })
        .from(examSessions)
        .innerJoin(students, eq(students.id, examSessions.studentId))
        .innerJoin(users, eq(users.id, students.userId))
        .where(eq(examSessions.examId, id))
        .orderBy(sql`${examSessions.score} desc nulls last`, asc(students.rollNo));

      // Standard competition ranking: ties share a rank.
      let rank = 0;
      let prev: number | null = null;
      let seen = 0;
      const results = rows.map((r) => {
        if (r.score == null) return { ...r, rank: null as number | null };
        seen++;
        if (r.score !== prev) {
          rank = seen;
          prev = r.score;
        }
        return { ...r, rank: rank as number | null };
      });

      return {
        exam: { id: exam.id, title: exam.title, status: exam.status },
        maxScore: m?.maxScore ?? 0,
        attempted: rows.length,
        results,
      };
    });
  });
}
