import {
  DEFAULT_POLICY,
  gradeExam,
  orderOptions,
  orderQuestions,
  type AnswerValue,
} from "@shiksha/exam-engine";
import {
  exams, examQuestions, examSessions, examAnswers, questions,
  eq, and, asc, sql, type Tx,
} from "@shiksha/db";

export type SessionRow = typeof examSessions.$inferSelect;
export type ExamRow = typeof exams.$inferSelect;

export const RESUME_WINDOW_MS = DEFAULT_POLICY.resumeWindowMs;

export const pastWindow = (s: SessionRow, nowMs: number) =>
  nowMs > s.deadlineAt.getTime() + RESUME_WINDOW_MS;

export async function gradeSession(tx: Tx, session: SessionRow) {
  const qs = await tx
    .select({
      id: questions.id,
      type: questions.type,
      correct: questions.correct,
      marks: questions.marks,
      negativeMarks: questions.negativeMarks,
    })
    .from(examQuestions)
    .innerJoin(questions, eq(questions.id, examQuestions.questionId))
    .where(eq(examQuestions.examId, session.examId));

  const ans = await tx
    .select({ questionId: examAnswers.questionId, response: examAnswers.response })
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, session.id));

  const map = new Map<string, AnswerValue>(ans.map((a) => [a.questionId, a.response as AnswerValue]));
  return gradeExam(qs, map);
}

/** Grades and closes a session. The status guard makes it a no-op if someone else finalized first. */
export async function finalizeSession(
  tx: Tx,
  session: SessionRow,
  status: "submitted" | "expired",
  nowMs: number,
) {
  const result = await gradeSession(tx, session);
  await tx
    .update(examSessions)
    .set({ status, submittedAt: new Date(nowMs), score: result.total })
    .where(and(eq(examSessions.id, session.id), eq(examSessions.status, "in_progress")));
  return result;
}

/** Finalizes sessions whose deadline + resume window has passed. The Batch 6 worker will call this on a schedule. */
export async function expireOverdue(tx: Tx, nowMs: number, examId?: string): Promise<number> {
  const cutoff = new Date(nowMs - RESUME_WINDOW_MS).toISOString();
  const overdue = await tx
    .select()
    .from(examSessions)
    .where(
      and(
        eq(examSessions.status, "in_progress"),
        sql`${examSessions.deadlineAt} < ${cutoff}::timestamptz`,
        examId ? eq(examSessions.examId, examId) : undefined,
      ),
    )
    .for("update", { skipLocked: true });
  for (const s of overdue) await finalizeSession(tx, s, "expired", nowMs);
  return overdue.length;
}

/** What the student's browser receives. Never includes correct answers. */
export async function buildPayload(tx: Tx, session: SessionRow, exam: ExamRow, nowMs: number) {
  const qs = await tx
    .select({
      id: questions.id,
      subject: questions.subject,
      type: questions.type,
      body: questions.body,
      options: questions.options,
      marks: questions.marks,
      negativeMarks: questions.negativeMarks,
    })
    .from(examQuestions)
    .innerJoin(questions, eq(questions.id, examQuestions.questionId))
    .where(eq(examQuestions.examId, exam.id))
    .orderBy(asc(examQuestions.position));

  const byId = new Map(qs.map((q) => [q.id, q]));
  const ids = qs.map((q) => q.id);
  const ordered = exam.shuffle ? orderQuestions(ids, session.seed) : ids;

  const out = ordered.map((id) => {
    const q = byId.get(id)!;
    let options = q.options ?? undefined;
    if (options && exam.shuffle) {
      const opts = options;
      options = orderOptions(id, opts.map((o) => o.id), session.seed).map(
        (oid) => opts.find((o) => o.id === oid)!,
      );
    }
    return {
      id: q.id, subject: q.subject, type: q.type, body: q.body,
      marks: q.marks, negativeMarks: q.negativeMarks, options,
    };
  });

  const saved = await tx
    .select({
      questionId: examAnswers.questionId,
      response: examAnswers.response,
      markedForReview: examAnswers.markedForReview,
      clientSeq: examAnswers.clientSeq,
    })
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, session.id));

  return {
    session: {
      id: session.id,
      examId: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      deadlineAt: session.deadlineAt.toISOString(),
      serverNow: new Date(nowMs).toISOString(),
    },
    questions: out,
    answers: saved,
  };
}
