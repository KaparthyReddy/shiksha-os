import { gradeExam, type AnswerValue } from "@shiksha/exam-engine";
import type { ReportCardData, ReportCardExam } from "@shiksha/pdf";
import {
  attendance, batches, enrollments, examAnswers, examQuestions, examSessions, exams, questions, students, tenants, users,
  eq, and, inArray, asc, sql, type Tx,
} from "@shiksha/db";
import { addToSubject, attendancePercentage, competitionRank, subjectList, type SubjectTotals } from "./calc";

type Loaded = Omit<ReportCardData, "generatedAt" | "remark">;

/** Only exams whose results have been released are included, whoever is asking. */
export async function loadReportCard(tx: Tx, tenantId: string, studentId: string): Promise<Loaded | null> {
  const [stu] = await tx
    .select({ name: users.name, rollNo: students.rollNo })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.id, studentId))
    .limit(1);
  if (!stu) return null;

  const [org] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const batchRows = await tx
    .select({ name: batches.name })
    .from(enrollments)
    .innerJoin(batches, eq(batches.id, enrollments.batchId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(asc(batches.name));

  const sessions = await tx
    .select({
      id: examSessions.id,
      examId: examSessions.examId,
      score: examSessions.score,
      startedAt: examSessions.startedAt,
      submittedAt: examSessions.submittedAt,
      title: exams.title,
    })
    .from(examSessions)
    .innerJoin(exams, eq(exams.id, examSessions.examId))
    .where(
      and(
        eq(examSessions.studentId, studentId),
        inArray(examSessions.status, ["submitted", "expired"]),
        eq(exams.resultsReleased, true),
      ),
    )
    .orderBy(asc(examSessions.startedAt));

  const examRows: ReportCardExam[] = [];
  const subjectTotals: SubjectTotals = new Map();

  if (sessions.length > 0) {
    const examIds = [...new Set(sessions.map((s) => s.examId))];
    const sessionIds = sessions.map((s) => s.id);

    const qrows = await tx
      .select({
        examId: examQuestions.examId,
        id: questions.id,
        subject: questions.subject,
        type: questions.type,
        correct: questions.correct,
        marks: questions.marks,
        negativeMarks: questions.negativeMarks,
      })
      .from(examQuestions)
      .innerJoin(questions, eq(questions.id, examQuestions.questionId))
      .where(inArray(examQuestions.examId, examIds));

    const arows = await tx
      .select({ sessionId: examAnswers.sessionId, questionId: examAnswers.questionId, response: examAnswers.response })
      .from(examAnswers)
      .where(inArray(examAnswers.sessionId, sessionIds));

    const everyone = await tx
      .select({ examId: examSessions.examId, score: examSessions.score })
      .from(examSessions)
      .where(and(inArray(examSessions.examId, examIds), inArray(examSessions.status, ["submitted", "expired"])));

    const qByExam = new Map<string, typeof qrows>();
    for (const q of qrows) qByExam.set(q.examId, [...(qByExam.get(q.examId) ?? []), q]);
    const aBySession = new Map<string, Map<string, AnswerValue>>();
    for (const a of arows) {
      const m = aBySession.get(a.sessionId) ?? new Map<string, AnswerValue>();
      m.set(a.questionId, a.response as AnswerValue);
      aBySession.set(a.sessionId, m);
    }
    const scoresByExam = new Map<string, number[]>();
    for (const r of everyone) {
      if (r.score === null) continue;
      scoresByExam.set(r.examId, [...(scoresByExam.get(r.examId) ?? []), r.score]);
    }

    for (const s of sessions) {
      const qs = qByExam.get(s.examId) ?? [];
      const graded = gradeExam(qs, aBySession.get(s.id) ?? new Map());
      const byId = new Map(qs.map((q) => [q.id, q]));
      for (const r of graded.perQuestion) {
        const q = byId.get(r.questionId);
        if (q) addToSubject(subjectTotals, q.subject, r.score, q.marks);
      }
      const peers = scoresByExam.get(s.examId) ?? [];
      examRows.push({
        title: s.title,
        date: s.submittedAt ?? s.startedAt,
        score: graded.total,
        maxScore: graded.maxScore,
        rank: peers.length > 0 ? competitionRank(s.score ?? graded.total, peers) : null,
        attempted: peers.length,
      });
    }
  }

  const att = await tx
    .select({ status: attendance.status, n: sql<number>`count(*)::int` })
    .from(attendance)
    .where(eq(attendance.studentId, studentId))
    .groupBy(attendance.status);
  const count = (st: string) => att.find((a) => a.status === st)?.n ?? 0;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const excused = count("excused");

  return {
    orgName: org?.name ?? "",
    studentName: stu.name,
    rollNo: stu.rollNo,
    batches: batchRows.map((b) => b.name),
    exams: examRows,
    subjects: subjectList(subjectTotals),
    attendance: { present, late, absent, excused, percentage: attendancePercentage(present, late, absent) },
  };
}
