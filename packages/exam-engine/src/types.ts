export type QuestionKind = "single_choice" | "multi_choice" | "numeric";
export type AnswerValue = string | number | string[] | null;

export interface GradableQuestion {
  id: string;
  type: QuestionKind;
  /** Option ids for choice questions; a single numeric string for numeric. */
  correct: string[];
  marks: number;
  /** Stored as a positive number; subtracted when the answer is wrong. */
  negativeMarks: number;
}

export interface AnswerItem {
  questionId: string;
  response: AnswerValue;
  markedForReview: boolean;
  /** Increases by 1 per change to this question. The highest seq wins. */
  clientSeq: number;
  /** Epoch ms, corrected by ClockSync. Untrusted by the server beyond bounds checks. */
  clientTs: number;
}

export interface SyncPolicy {
  /** Tolerance for clock skew and network latency around the deadline. */
  graceMs: number;
  /** How long after the deadline an offline client may still deliver answers. */
  resumeWindowMs: number;
}
