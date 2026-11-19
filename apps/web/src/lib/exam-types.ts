import type { AnswerValue } from "@shiksha/exam-engine";

export interface ApiErrorBody {
  error?: { code: string; message: string };
}

export interface PayloadQuestion {
  id: string;
  subject: string;
  type: "single_choice" | "multi_choice" | "numeric";
  body: string;
  marks: number;
  negativeMarks: number;
  options?: { id: string; text: string }[];
}

export interface ExamPayload {
  session: {
    id: string;
    examId: string;
    title: string;
    durationMinutes: number;
    status: "in_progress" | "submitted" | "expired";
    startedAt: string;
    deadlineAt: string;
    serverNow: string;
  };
  questions: PayloadQuestion[];
  answers: { questionId: string; response: AnswerValue; markedForReview: boolean; clientSeq: number }[];
}

export interface SyncResponse {
  accepted: number;
  ack: { questionId: string; clientSeq: number }[];
  rejected: { questionId: string; clientSeq: number; reason?: string }[];
  serverNow: string;
  deadlineAt: string;
  status: "in_progress" | "submitted" | "expired";
}

export interface TimeResponse {
  serverNow: string;
  deadlineAt: string;
  status: "in_progress" | "submitted" | "expired";
}

export interface SubmitResult {
  status: "submitted" | "expired";
  total: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unanswered: number;
}
