import PDFDocument from "pdfkit";

export interface ReportCardExam {
  title: string;
  date: Date | null;
  score: number;
  maxScore: number;
  rank: number | null;
  attempted: number;
}
export interface ReportCardSubject {
  subject: string;
  score: number;
  maxScore: number;
}
export interface ReportCardData {
  orgName: string;
  studentName: string;
  rollNo: string;
  batches: string[];
  generatedAt: Date;
  exams: ReportCardExam[];
  subjects: ReportCardSubject[];
  attendance: { present: number; late: number; absent: number; excused: number; percentage: number | null };
  remark?: string;
}

const pct = (s: number, m: number) => (m > 0 ? `${Math.round((s / m) * 1000) / 10}%` : "-");
const num = (n: number) => String(Math.round(n * 100) / 100);
const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

type Col = { label: string; w: number; align?: "left" | "right" | "center" };

/** The built-in PDF fonts cover Latin text only. Names in other scripts need an embedded font (see known limits). */
export function renderReportCard(d: ReportCardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: { Title: `Report card - ${d.studentName}`, Author: d.orgName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom;

    const ensure = (h: number, redraw?: () => void) => {
      if (doc.y + h > bottom) {
        doc.addPage();
        redraw?.();
      }
    };

    const heading = (t: string) => {
      ensure(70);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(t, left, doc.y, { width });
      doc.y += 6;
    };

    const note = (t: string) => {
      doc.font("Helvetica").fontSize(9.5).fillColor("#64748b").text(t, left, doc.y, { width });
      doc.y += 10;
    };

    const table = (cols: Col[], rows: string[][]) => {
      const rowH = 22;
      const header = () => {
        const y = doc.y;
        doc.rect(left, y, width, rowH).fill("#eef2f7");
        let x = left;
        doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9);
        for (const c of cols) {
          doc.text(c.label, x + 6, y + 7, { width: c.w - 12, align: c.align ?? "left", lineBreak: false });
          x += c.w;
        }
        doc.y = y + rowH;
      };
      header();
      rows.forEach((r, i) => {
        ensure(rowH, header);
        const y = doc.y;
        if (i % 2 === 1) doc.rect(left, y, width, rowH).fill("#f8fafc");
        let x = left;
        doc.fillColor("#0f172a").font("Helvetica").fontSize(9.5);
        r.forEach((cell, j) => {
          const c = cols[j]!;
          doc.text(cell, x + 6, y + 6, { width: c.w - 12, align: c.align ?? "left", lineBreak: false, ellipsis: true });
          x += c.w;
        });
        doc.y = y + rowH;
      });
      doc.y += 14;
    };

    // ---------- Header ----------
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(d.orgName, left, doc.y, { width, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("ACADEMIC REPORT CARD", left, doc.y + 2, { width, align: "center" });
    doc.y += 22;

    const info = (label: string, value: string, x: number, y: number, w: number) => {
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(label.toUpperCase(), x, y, { width: w, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(value, x, y + 12, { width: w, lineBreak: false, ellipsis: true });
    };
    const infoY = doc.y;
    info("Student", d.studentName, left, infoY, 260);
    info("Roll no.", d.rollNo, left + 280, infoY, 110);
    info("Report date", day(d.generatedAt), left + 400, infoY, 115);
    info("Batch", d.batches.join(", ") || "-", left, infoY + 36, width);
    doc.y = infoY + 72;

    // ---------- Summary ----------
    const totalScore = d.exams.reduce((s, e) => s + e.score, 0);
    const totalMax = d.exams.reduce((s, e) => s + e.maxScore, 0);
    const boxes: [string, string][] = [
      ["Overall score", d.exams.length > 0 ? `${num(totalScore)} / ${num(totalMax)}` : "-"],
      ["Overall %", d.exams.length > 0 ? pct(totalScore, totalMax) : "-"],
      ["Exams taken", String(d.exams.length)],
      ["Attendance", d.attendance.percentage === null ? "-" : `${d.attendance.percentage}%`],
    ];
    const bw = (width - 30) / 4;
    const by = doc.y;
    boxes.forEach(([label, value], i) => {
      const x = left + i * (bw + 10);
      doc.roundedRect(x, by, bw, 50, 6).lineWidth(1).strokeColor("#e2e8f0").stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(label.toUpperCase(), x + 10, by + 9, { width: bw - 20, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text(value, x + 10, by + 24, { width: bw - 20, lineBreak: false, ellipsis: true });
    });
    doc.y = by + 70;

    // ---------- Exam results ----------
    heading("Exam results");
    if (d.exams.length === 0) {
      note("No exam results have been released yet.");
    } else {
      table(
        [
          { label: "Exam", w: 235 },
          { label: "Date", w: 80 },
          { label: "Score", w: 85, align: "right" },
          { label: "%", w: 55, align: "right" },
          { label: "Rank", w: 60, align: "right" },
        ],
        d.exams.map((e) => [
          e.title,
          day(e.date),
          `${num(e.score)} / ${num(e.maxScore)}`,
          pct(e.score, e.maxScore),
          e.rank === null ? "-" : `${e.rank} / ${e.attempted}`,
        ]),
      );
    }

    // ---------- Subjects ----------
    heading("Subject-wise performance");
    if (d.subjects.length === 0) {
      note("Subject-wise marks appear once exam results are released.");
    } else {
      table(
        [
          { label: "Subject", w: 245 },
          { label: "Marks", w: 90, align: "right" },
          { label: "Maximum", w: 90, align: "right" },
          { label: "%", w: 90, align: "right" },
        ],
        d.subjects.map((s) => [s.subject, num(s.score), num(s.maxScore), pct(s.score, s.maxScore)]),
      );
    }

    // ---------- Attendance ----------
    heading("Attendance");
    const a = d.attendance;
    note(
      a.percentage === null
        ? "No attendance has been recorded yet."
        : `Present ${a.present}  |  Late ${a.late}  |  Absent ${a.absent}  |  Excused ${a.excused}  |  Attendance ${a.percentage}% (late counts as attended; excused days are left out)`,
    );

    // ---------- Remark ----------
    if (d.remark) {
      heading("Teacher's remark");
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#0f172a").text(d.remark, left, doc.y, { width });
      doc.y += 10;
    }

    ensure(40);
    doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(
      "This is a computer-generated report card and needs no signature.",
      left,
      doc.y + 16,
      { width, align: "center" },
    );
    doc.end();
  });
}
