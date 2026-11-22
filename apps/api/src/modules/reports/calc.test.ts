import { describe, it, expect } from "vitest";
import { addToSubject, attendancePercentage, competitionRank, subjectList, type SubjectTotals } from "./calc";

describe("report card maths", () => {
  it("ranks with ties sharing a position", () => {
    const all = [10, 10, 8, 3];
    expect(competitionRank(10, all)).toBe(1);
    expect(competitionRank(8, all)).toBe(3);
    expect(competitionRank(3, all)).toBe(4);
  });

  it("computes attendance with late counted and excused ignored", () => {
    expect(attendancePercentage(8, 1, 1)).toBe(90);
    expect(attendancePercentage(0, 0, 0)).toBeNull();
    expect(attendancePercentage(0, 0, 3)).toBe(0);
  });

  it("adds up subject totals across exams, negatives included", () => {
    const m: SubjectTotals = new Map();
    addToSubject(m, "Physics", 4, 4);
    addToSubject(m, "Physics", -1, 4);
    addToSubject(m, "Chemistry", 4, 4);
    expect(subjectList(m)).toEqual([
      { subject: "Chemistry", score: 4, maxScore: 4 },
      { subject: "Physics", score: 3, maxScore: 8 },
    ]);
  });
});
