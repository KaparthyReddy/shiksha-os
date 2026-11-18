import { describe, it, expect } from "vitest";
import { AnswerBuffer } from "./index";

describe("AnswerBuffer", () => {
  it("increments seq per question and keeps only the latest pending", () => {
    const b = new AnswerBuffer(() => 1000);
    b.record("q1", "a");
    const second = b.record("q1", "b");
    expect(second.clientSeq).toBe(2);
    expect(b.pending()).toHaveLength(1);
    expect(b.pending()[0]!.response).toBe("b");
  });
  it("ack clears only entries at or below the acked seq", () => {
    const b = new AnswerBuffer(() => 1000);
    b.record("q1", "a");
    b.ack([{ questionId: "q1", clientSeq: 1 }]);
    expect(b.pending()).toHaveLength(0);
    b.record("q1", "b"); // seq 2
    b.ack([{ questionId: "q1", clientSeq: 1 }]); // stale ack
    expect(b.pending()).toHaveLength(1);
  });
  it("survives a reload via snapshot and keeps counting seq", () => {
    const b = new AnswerBuffer(() => 1000);
    b.record("q1", "a");
    const restored = new AnswerBuffer(() => 2000, JSON.parse(JSON.stringify(b.snapshot())));
    expect(restored.pending()).toHaveLength(1);
    expect(restored.record("q1", "c").clientSeq).toBe(2);
  });
});
