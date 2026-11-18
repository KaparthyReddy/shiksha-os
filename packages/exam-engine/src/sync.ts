import type { AnswerItem, SyncPolicy } from "./types";

export const DEFAULT_POLICY: SyncPolicy = { graceMs: 5_000, resumeWindowMs: 5 * 60_000 };

export type RejectReason =
  | "session_closed"
  | "resume_window_expired"
  | "claimed_after_deadline"
  | "stale_seq"
  | "unknown_question";

export interface Decision {
  questionId: string;
  clientSeq: number;
  accepted: boolean;
  /** Accepted, but delivered after the deadline via the resume window. Flag for audit. */
  late: boolean;
  reason?: RejectReason;
}

export interface DecideInput {
  incoming: AnswerItem[];
  /** Highest clientSeq already stored per question for this session. */
  storedSeq: ReadonlyMap<string, number>;
  validQuestionIds: ReadonlySet<string>;
  deadlineMs: number;
  serverNowMs: number;
  sessionOpen: boolean;
  policy?: SyncPolicy;
}

/** Pure decision logic. The API calls this, then persists whatever was accepted. */
export function decideAnswers(input: DecideInput): Decision[] {
  const policy = input.policy ?? DEFAULT_POLICY;

  // Within one batch, only the highest seq per question matters.
  const latest = new Map<string, AnswerItem>();
  for (const a of input.incoming) {
    const cur = latest.get(a.questionId);
    if (!cur || a.clientSeq > cur.clientSeq) latest.set(a.questionId, a);
  }

  const late = input.serverNowMs > input.deadlineMs + policy.graceMs;
  const windowExpired = input.serverNowMs > input.deadlineMs + policy.resumeWindowMs;

  return [...latest.values()].map((a): Decision => {
    const base = { questionId: a.questionId, clientSeq: a.clientSeq, late };
    const reject = (reason: RejectReason): Decision => ({ ...base, accepted: false, reason });

    if (!input.sessionOpen) return reject("session_closed");
    if (windowExpired) return reject("resume_window_expired");
    if (!input.validQuestionIds.has(a.questionId)) return reject("unknown_question");
    if (a.clientTs > input.deadlineMs + policy.graceMs) return reject("claimed_after_deadline");
    if ((input.storedSeq.get(a.questionId) ?? 0) >= a.clientSeq) return reject("stale_seq");
    return { ...base, accepted: true };
  });
}
