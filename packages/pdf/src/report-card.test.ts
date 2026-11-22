import { describe, it, expect } from "vitest";
import { renderReportCard, type ReportCardData } from "./report-card";

const base: ReportCardData = {
  orgName: "Demo Academy",
  studentName: "Student 1",
  rollNo: "DA-2026-001",
  batches: ["NEET 2027 - Morning"],
  generatedAt: new Date("2026-11-20T10:00:00Z"),
  exams: [
    { title: "Physics Mock CBT #1", date: new Date("2026-11-10T10:00:00Z"), score: 18, maxScore: 20, rank: 1, attempted: 5 },
    { title: "Chemistry Mock", date: null, score: -2, maxScore: 20, rank: 5, attempted: 5 },
  ],
  subjects: [
    { subject: "Physics", score: 18, maxScore: 20 },
    { subject: "Chemistry", score: -2, maxScore: 20 },
  ],
  attendance: { present: 8, late: 1, absent: 1, excused: 0, percentage: 90 },
  remark: "Strong in mechanics. Practise numerical problems daily.",
};

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("report card pdf", () => {
  it("renders a real PDF", async () => {
    const pdf = await renderReportCard(base);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it("copes with a student who has no results yet", async () => {
    const pdf = await renderReportCard({
      ...base,
      exams: [],
      subjects: [],
      attendance: { present: 0, late: 0, absent: 0, excused: 0, percentage: null },
      remark: undefined,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("runs onto more pages when there are many exams", async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      title: `Weekly test ${i + 1}`,
      date: new Date("2026-11-10T10:00:00Z"),
      score: 10,
      maxScore: 20,
      rank: 3,
      attempted: 40,
    }));
    const pdf = await renderReportCard({ ...base, exams: many });
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});
