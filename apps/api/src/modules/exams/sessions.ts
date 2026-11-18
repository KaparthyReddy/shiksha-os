import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { computeDeadline, decideAnswers } from "@shiksha/exam-engine";
import { syncAnswersSchema } from "@shiksha/shared";
import {
  exams, examQuestions, examSessions, examAnswers, enrollments,
  eq, and, or, inArray, isNull, not, desc, sql,
} from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { AppError, notFound } from "../../core/errors";
import { idParams, conflict, pgCode } from "../../core/http";
import { studentIdOf } from "../../core/people";
import { RESUME_WINDOW_MS, buildPayload, finalizeSession, gradeSession, pastWindow } from "./service";

const student = requireRole("student");

const ended = () => new AppError(409, "exam_ended", "This exam is no longer open");

export async function sessionRoutes(app: FastifyInstance) {
  // ---------- My exams ----------
  app.get("/me/exams", { preHandler: student }, async (req) => {
    const nowMs = Date.now();
    return inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const myBatches = tx.select({ id: enrollments.batchId }).from(enrollments).where(eq(enrollments.studentId, sid));

      const rows = await tx
        .select({
          id: exams.id,
          title: exams.title,
          durationMinutes: exams.durationMinutes,
          startsAt: exams.startsAt,
          endsAt: exams.endsAt,
          examStatus: exams.status,
          sessionId: examSessions.id,
          sessionStatus: examSessions.status,
          deadlineAt: examSessions.deadlineAt,
          score: examSessions.score,
        })
        .from(exams)
        .leftJoin(examSessions, and(eq(examSessions.examId, exams.id), eq(examSessions.studentId, sid)))
        .where(
          and(
            or(isNull(exams.batchId), inArray(exams.batchId, myBatches)),
            or(
              eq(exams.status, "published"),
              and(eq(exams.status, "closed"), sql`${examSessions.id} is not null`),
            ),
          ),
        )
        .orderBy(desc(exams.createdAt));

      return rows.map((r) => {
        let state: string;
        if (r.sessionStatus === "in_progress") {
          state = r.deadlineAt && nowMs > r.deadlineAt.getTime() + RESUME_WINDOW_MS ? "expired" : "in_progress";
        } else if (r.sessionStatus) {
          state = r.sessionStatus;
        } else if (r.examStatus === "closed" || (r.endsAt && nowMs > r.endsAt.getTime())) {
          state = "missed";
        } else if (r.startsAt && nowMs < r.startsAt.getTime()) {
          state = "upcoming";
        } else {
          state = "open";
        }
        return {
          id: r.id,
          title: r.title,
          durationMinutes: r.durationMinutes,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          state,
          sessionId: r.sessionId,
          score: r.sessionStatus && r.sessionStatus !== "in_progress" ? r.score : null,
        };
      });
    });
  });

  // ---------- Start (idempotent: also the "resume" call) ----------
  app.post("/exams/:id/start", { preHandler: student }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { tenantId } = req.auth!;
    const nowMs = Date.now();

    const attempt = () =>
      inTenant(req, async (tx) => {
        const sid = await studentIdOf(tx, req.auth!.userId);

        const [exam] = await tx.select().from(exams).where(eq(exams.id, id)).limit(1);
        if (!exam || exam.status === "draft") throw notFound("Exam not found");

        if (exam.batchId) {
          const [en] = await tx
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(and(eq(enrollments.batchId, exam.batchId), eq(enrollments.studentId, sid)))
            .limit(1);
          if (!en) throw notFound("Exam not found");
        }

        const [existing] = await tx
          .select()
          .from(examSessions)
          .where(and(eq(examSessions.examId, id), eq(examSessions.studentId, sid)))
          .limit(1);

        if (existing) {
          if (existing.status !== "in_progress") throw conflict("You have already submitted this exam");
          if (pastWindow(existing, nowMs)) {
            await finalizeSession(tx, existing, "expired", nowMs);
            return { kind: "ended" as const };
          }
          return { kind: "ok" as const, created: false, payload: await buildPayload(tx, existing, exam, nowMs) };
        }

        if (exam.status !== "published") throw new AppError(409, "exam_closed", "This exam is closed");
        if (exam.startsAt && nowMs < exam.startsAt.getTime()) {
          throw new AppError(409, "exam_not_open", "This exam has not started yet");
        }
        if (exam.endsAt && nowMs > exam.endsAt.getTime()) {
          throw new AppError(409, "exam_closed", "This exam has ended");
        }

        const deadline = computeDeadline(nowMs, exam.durationMinutes, exam.endsAt?.getTime());
        const [session] = await tx
          .insert(examSessions)
          .values({
            tenantId,
            examId: id,
            studentId: sid,
            seed: randomInt(1, 2_147_483_647),
            startedAt: new Date(nowMs),
            deadlineAt: new Date(deadline),
            lastSeenAt: new Date(nowMs),
          })
          .returning();
        return { kind: "ok" as const, created: true, payload: await buildPayload(tx, session!, exam, nowMs) };
      });

    let r;
    try {
      r = await attempt();
    } catch (e) {
      // Two simultaneous first clicks: the loser retries and resumes the winner's session.
      if (pgCode(e) === "23505") r = await attempt();
      else throw e;
    }
    if (r.kind === "ended") throw ended();
    return reply.status(r.created ? 201 : 200).send(r.payload);
  });

  // ---------- Resume by session id ----------
  app.get("/exam-sessions/:id", { preHandler: student }, async (req) => {
    const { id } = idParams.parse(req.params);
    const nowMs = Date.now();
    const r = await inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const [session] = await tx
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, id), eq(examSessions.studentId, sid)))
        .limit(1);
      if (!session) throw notFound("Session not found");
      if (session.status !== "in_progress") return { kind: "closed" as const };
      if (pastWindow(session, nowMs)) {
        await finalizeSession(tx, session, "expired", nowMs);
        return { kind: "closed" as const };
      }
      const [exam] = await tx.select().from(exams).where(eq(exams.id, session.examId)).limit(1);
      return { kind: "ok" as const, payload: await buildPayload(tx, session, exam!, nowMs) };
    });
    if (r.kind === "closed") throw ended();
    return r.payload;
  });

  // ---------- Heartbeat / clock sync ----------
  app.get("/exam-sessions/:id/time", { preHandler: student }, async (req) => {
    const { id } = idParams.parse(req.params);
    const nowMs = Date.now();
    return inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const [session] = await tx
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, id), eq(examSessions.studentId, sid)))
        .limit(1);
      if (!session) throw notFound("Session not found");
      if (session.status === "in_progress") {
        await tx.update(examSessions).set({ lastSeenAt: new Date(nowMs) }).where(eq(examSessions.id, id));
      }
      return {
        serverNow: new Date(nowMs).toISOString(),
        deadlineAt: session.deadlineAt.toISOString(),
        status: session.status,
      };
    });
  });

  // ---------- Answer sync ----------
  app.post("/exam-sessions/:id/answers", { preHandler: student }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = syncAnswersSchema.parse(req.body);
    const { tenantId } = req.auth!;
    const nowMs = Date.now();

    return inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const [session] = await tx
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, id), eq(examSessions.studentId, sid)))
        .limit(1);
      if (!session) throw notFound("Session not found");

      const valid = await tx
        .select({ id: examQuestions.questionId })
        .from(examQuestions)
        .where(eq(examQuestions.examId, session.examId));
      const stored = await tx
        .select({ questionId: examAnswers.questionId, clientSeq: examAnswers.clientSeq })
        .from(examAnswers)
        .where(
          and(
            eq(examAnswers.sessionId, id),
            inArray(examAnswers.questionId, body.answers.map((a) => a.questionId)),
          ),
        );

      const decisions = decideAnswers({
        incoming: body.answers,
        storedSeq: new Map(stored.map((s) => [s.questionId, s.clientSeq])),
        validQuestionIds: new Set(valid.map((v) => v.id)),
        deadlineMs: session.deadlineAt.getTime(),
        serverNowMs: nowMs,
        sessionOpen: session.status === "in_progress",
      });

      const itemFor = new Map(body.answers.map((a) => [`${a.questionId}:${a.clientSeq}`, a]));
      const rows = decisions
        .filter((d) => d.accepted)
        .map((d) => {
          const a = itemFor.get(`${d.questionId}:${d.clientSeq}`)!;
          return {
            tenantId,
            sessionId: id,
            questionId: a.questionId,
            response: a.response,
            markedForReview: a.markedForReview,
            clientSeq: a.clientSeq,
            clientTs: a.clientTs,
            late: d.late,
            serverReceivedAt: new Date(nowMs),
          };
        });

      if (rows.length > 0) {
        // One statement; a row is only overwritten when the incoming seq is higher.
        await tx
          .insert(examAnswers)
          .values(rows)
          .onConflictDoUpdate({
            target: [examAnswers.sessionId, examAnswers.questionId],
            set: {
              response: sql`excluded.response`,
              markedForReview: sql`excluded.marked_for_review`,
              clientSeq: sql`excluded.client_seq`,
              clientTs: sql`excluded.client_ts`,
              late: sql`excluded.late`,
              serverReceivedAt: sql`excluded.server_received_at`,
            },
            setWhere: sql`${examAnswers.clientSeq} < excluded.client_seq`,
          });
      }

      let status = session.status;
      if (status === "in_progress") {
        if (pastWindow(session, nowMs)) {
          await finalizeSession(tx, session, "expired", nowMs);
          status = "expired";
        } else {
          await tx.update(examSessions).set({ lastSeenAt: new Date(nowMs) }).where(eq(examSessions.id, id));
        }
      }

      return {
        accepted: rows.length,
        // Every decision is terminal, so the client should ack all of these (AnswerBuffer.ack).
        ack: decisions.map((d) => ({ questionId: d.questionId, clientSeq: d.clientSeq })),
        rejected: decisions
          .filter((d) => !d.accepted)
          .map((d) => ({ questionId: d.questionId, clientSeq: d.clientSeq, reason: d.reason })),
        serverNow: new Date(nowMs).toISOString(),
        deadlineAt: session.deadlineAt.toISOString(),
        status,
      };
    });
  });

  // ---------- Submit (idempotent) ----------
  app.post("/exam-sessions/:id/submit", { preHandler: student }, async (req) => {
    const { id } = idParams.parse(req.params);
    const nowMs = Date.now();
    return inTenant(req, async (tx) => {
      const sid = await studentIdOf(tx, req.auth!.userId);
      const [session] = await tx
        .select()
        .from(examSessions)
        .where(and(eq(examSessions.id, id), eq(examSessions.studentId, sid)))
        .for("update");
      if (!session) throw notFound("Session not found");

      let status = session.status;
      let result;
      if (status === "in_progress") {
        status = pastWindow(session, nowMs) ? "expired" : "submitted";
        result = await finalizeSession(tx, session, status, nowMs);
      } else {
        result = await gradeSession(tx, session);
      }
      return {
        status,
        total: result.total,
        maxScore: result.maxScore,
        correct: result.correct,
        wrong: result.wrong,
        unanswered: result.unanswered,
      };
    });
  });
}
