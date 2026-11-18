import { describe, it, expect } from "vitest";
import { decideAnswers, type AnswerItem } from "./index";

const DEADLINE = 1_000_000;
const item = (questionId: string, clientSeq: number, clientTs = 899_000): AnswerItem => ({
  questionId,
  response: "a",
  markedForReview: false,
  clientSeq,
  clientTs,
});
const base = {
  storedSeq: new Map<string, number>(),
  validQuestionIds: new Set(["q1", "q2"]),
  deadlineMs: DEADLINE,
  serverNowMs: 900_000,
  sessionOpen: true,
};

describe("decideAnswers", () => {
  it("accepts a normal in-time answer", () => {
    const [d] = decideAnswers({ ...base, incoming: [item("q1", 1)] });
    expect(d).toMatchObject({ accepted: true, late: false });
  });
  it("keeps only the highest seq per question within a batch", () => {
    const out = decideAnswers({ ...base, incoming: [item("q1", 1), item("q1", 3), item("q1", 2)] });
    expect(out).toHaveLength(1);
    expect(out[0]!.clientSeq).toBe(3);
  });
  it("rejects stale or duplicate seq (idempotent retries)", () => {
    const storedSeq = new Map([["q1", 5]]);
    expect(decideAnswers({ ...base, storedSeq, incoming: [item("q1", 5)] })[0]!.reason).toBe("stale_seq");
    expect(decideAnswers({ ...base, storedSeq, incoming: [item("q1", 6)] })[0]!.accepted).toBe(true);
  });
  it("rejects unknown questions", () => {
    expect(decideAnswers({ ...base, incoming: [item("zzz", 1)] })[0]!.reason).toBe("unknown_question");
  });
  it("accepts an offline answer delivered after the deadline, flagged late", () => {
    const [d] = decideAnswers({ ...base, serverNowMs: DEADLINE + 60_000, incoming: [item("q1", 1)] });
    expect(d).toMatchObject({ accepted: true, late: true });
  });
  it("rejects everything once the resume window has expired", () => {
    const [d] = decideAnswers({ ...base, serverNowMs: DEADLINE + 6 * 60_000, incoming: [item("q1", 1)] });
    expect(d!.reason).toBe("resume_window_expired");
  });
  it("rejects answers whose claimed time is after the deadline", () => {
    const [d] = decideAnswers({ ...base, serverNowMs: DEADLINE + 1_000, incoming: [item("q1", 1, DEADLINE + 10_000)] });
    expect(d!.reason).toBe("claimed_after_deadline");
  });
  it("rejects when the session is already submitted", () => {
    const [d] = decideAnswers({ ...base, sessionOpen: false, incoming: [item("q1", 1)] });
    expect(d!.reason).toBe("session_closed");
  });
});
