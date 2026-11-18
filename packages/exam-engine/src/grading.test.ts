import { describe, it, expect } from "vitest";
import { gradeQuestion, gradeExam, type GradableQuestion, type AnswerValue } from "./index";

const single: GradableQuestion = { id: "s", type: "single_choice", correct: ["b"], marks: 4, negativeMarks: 1 };
const multi: GradableQuestion = { id: "m", type: "multi_choice", correct: ["a", "c"], marks: 4, negativeMarks: 1 };
const num: GradableQuestion = { id: "n", type: "numeric", correct: ["9.8"], marks: 4, negativeMarks: 0 };

describe("gradeQuestion", () => {
  it("single choice: correct, wrong, unanswered", () => {
    expect(gradeQuestion(single, "b").score).toBe(4);
    expect(gradeQuestion(single, "a").score).toBe(-1);
    expect(gradeQuestion(single, null).outcome).toBe("unanswered");
    expect(gradeQuestion(single, "  ").outcome).toBe("unanswered");
  });
  it("multi choice needs the exact set, any order", () => {
    expect(gradeQuestion(multi, ["c", "a"]).outcome).toBe("correct");
    expect(gradeQuestion(multi, ["a"]).outcome).toBe("wrong");
    expect(gradeQuestion(multi, ["a", "c", "d"]).outcome).toBe("wrong");
  });
  it("numeric accepts numbers and numeric strings within tolerance", () => {
    expect(gradeQuestion(num, 9.8).outcome).toBe("correct");
    expect(gradeQuestion(num, "9.8").outcome).toBe("correct");
    expect(gradeQuestion(num, 9.81).outcome).toBe("wrong");
    expect(gradeQuestion(num, "abc").outcome).toBe("wrong");
  });
});

describe("gradeExam", () => {
  it("totals marks, negatives, and counts", () => {
    const answers = new Map<string, AnswerValue>([
      ["s", "b"],
      ["m", ["a"]],
    ]);
    const r = gradeExam([single, multi, num], answers);
    expect(r.total).toBe(3);
    expect(r.maxScore).toBe(12);
    expect([r.correct, r.wrong, r.unanswered]).toEqual([1, 1, 1]);
  });
});
