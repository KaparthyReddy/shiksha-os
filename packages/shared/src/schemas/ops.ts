import { z } from "zod";
import { ATTENDANCE_STATUS, PAYMENT_METHOD, QUESTION_TYPES } from "../constants";

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const isoDateTime = z.string().datetime({ offset: true });
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;

// ---------- Question bank ----------
const optionSchema = z.object({
  id: z.string().trim().min(1).max(8),
  text: z.string().trim().min(1).max(1000),
});

export const questionSchema = z
  .object({
    subject: z.string().trim().min(1).max(80),
    topic: z.string().trim().max(120).optional(),
    type: z.enum(QUESTION_TYPES).default("single_choice"),
    body: z.string().trim().min(1).max(5000),
    options: z.array(optionSchema).max(8).optional(),
    correct: z.array(z.string().trim().min(1)).min(1).max(8),
    marks: z.number().positive().max(100).default(4),
    negativeMarks: z.number().min(0).max(100).default(1),
  })
  .superRefine((q, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if (q.type === "numeric") {
      if (q.options?.length) bad("Numeric questions have no options", ["options"]);
      if (q.correct.length !== 1 || !Number.isFinite(Number(q.correct[0]))) {
        bad("Provide exactly one numeric answer", ["correct"]);
      }
      return;
    }
    if (!q.options || q.options.length < 2) return bad("Provide at least 2 options", ["options"]);
    const ids = q.options.map((o) => o.id);
    if (!unique(ids)) bad("Option ids must be unique", ["options"]);
    if (!unique(q.correct) || !q.correct.every((c) => ids.includes(c))) {
      bad("Correct answers must be unique option ids", ["correct"]);
    }
    if (q.type === "single_choice" && q.correct.length !== 1) {
      bad("Single choice needs exactly one correct option", ["correct"]);
    }
  });

// ---------- Exams ----------
export const createExamSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    batchId: uuid.optional(),
    durationMinutes: z.number().int().min(1).max(600),
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    shuffle: z.boolean().default(true),
    releaseResults: z.boolean().default(true),
    questionIds: z.array(uuid).min(1).max(300).refine(unique, "Duplicate questions"),
  })
  .refine((e) => !e.startsAt || !e.endsAt || new Date(e.startsAt) < new Date(e.endsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

// ---------- Attendance ----------
export const markAttendanceSchema = z
  .object({
    batchId: uuid,
    date: dateStr,
    records: z
      .array(z.object({ studentId: uuid, status: z.enum(ATTENDANCE_STATUS) }))
      .min(1)
      .max(500),
  })
  .refine((a) => unique(a.records.map((r) => r.studentId)), {
    message: "Duplicate students",
    path: ["records"],
  });

// ---------- Fees (all amounts in integer paise) ----------
const paise = z.number().int().positive().max(2_000_000_000);

export const createFeePlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  amountPaise: paise,
  description: z.string().max(500).optional(),
});

export const createInvoiceSchema = z
  .object({
    studentId: uuid,
    feePlanId: uuid.optional(),
    amountPaise: paise.optional(),
    dueOn: dateStr.optional(),
  })
  .refine((i) => i.feePlanId || i.amountPaise, {
    message: "Provide feePlanId or amountPaise",
    path: ["amountPaise"],
  });

export const bulkInvoiceSchema = z.object({
  batchId: uuid,
  feePlanId: uuid,
  dueOn: dateStr.optional(),
});

export const recordPaymentSchema = z.object({
  amountPaise: paise,
  method: z.enum(PAYMENT_METHOD),
  reference: z.string().trim().max(120).optional(),
});
