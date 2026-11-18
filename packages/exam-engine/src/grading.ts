import type { AnswerValue, GradableQuestion } from "./types";

export type Outcome = "correct" | "wrong" | "unanswered";
export interface QuestionResult {
  questionId: string;
  outcome: Outcome;
  score: number;
}
export interface ExamResult {
  total: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unanswered: number;
  perQuestion: QuestionResult[];
}

export function isAnswered(r: AnswerValue | undefined): boolean {
  if (r === null || r === undefined) return false;
  if (typeof r === "string") return r.trim() !== "";
  if (Array.isArray(r)) return r.length > 0;
  return Number.isFinite(r);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return new Set(a).size === a.length && a.every((x) => sb.has(x));
}

function isCorrect(q: GradableQuestion, r: AnswerValue): boolean {
  switch (q.type) {
    case "single_choice": {
      const given = Array.isArray(r) ? (r.length === 1 ? r[0] : undefined) : r;
      return typeof given === "string" && q.correct.length === 1 && given === q.correct[0];
    }
    case "multi_choice":
      return Array.isArray(r) && sameSet(r, q.correct);
    case "numeric": {
      const given = typeof r === "number" ? r : typeof r === "string" ? Number(r) : NaN;
      const target = Number(q.correct[0]);
      if (!Number.isFinite(given) || !Number.isFinite(target)) return false;
      return Math.abs(given - target) <= Math.max(1e-9, Math.abs(target) * 1e-6);
    }
  }
}

export function gradeQuestion(q: GradableQuestion, response: AnswerValue | undefined): QuestionResult {
  if (!isAnswered(response)) return { questionId: q.id, outcome: "unanswered", score: 0 };
  if (isCorrect(q, response as AnswerValue)) return { questionId: q.id, outcome: "correct", score: q.marks };
  return { questionId: q.id, outcome: "wrong", score: -Math.abs(q.negativeMarks) };
}

export function gradeExam(
  questions: readonly GradableQuestion[],
  answers: ReadonlyMap<string, AnswerValue>,
): ExamResult {
  const perQuestion = questions.map((q) => gradeQuestion(q, answers.get(q.id)));
  const total = perQuestion.reduce((s, r) => s + r.score, 0);
  return {
    total: Math.round(total * 100) / 100,
    maxScore: questions.reduce((s, q) => s + q.marks, 0),
    correct: perQuestion.filter((r) => r.outcome === "correct").length,
    wrong: perQuestion.filter((r) => r.outcome === "wrong").length,
    unanswered: perQuestion.filter((r) => r.outcome === "unanswered").length,
    perQuestion,
  };
}
