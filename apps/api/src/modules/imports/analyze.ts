import type { ZodError } from "zod";
import { createFacultySchema, createStudentSchema } from "@shiksha/shared";
import { batches, enrollments, students, users, inArray, sql, type Tx } from "@shiksha/db";
import { badRequest, notFound } from "../../core/errors";
import type { Aliases, ParsedCsv } from "./csv";

export const STUDENT_ALIASES: Aliases = {
  name: ["full_name", "student_name", "student"],
  email: ["email_address", "e_mail", "mail"],
  roll_no: ["rollno", "roll_number", "roll", "admission_no", "admission_number"],
  guardian_name: ["guardian", "parent", "parent_name"],
  guardian_phone: ["phone", "parent_phone", "mobile", "contact"],
  batch: ["batch_name"],
};

export const FACULTY_ALIASES: Aliases = {
  name: ["full_name", "teacher_name", "teacher"],
  email: ["email_address", "e_mail", "mail"],
  designation: ["title", "position"],
  subjects: ["subject"],
};

export interface StudentData {
  name: string;
  email: string;
  rollNo: string;
  guardianName?: string;
  guardianPhone?: string;
  batchId: string | null;
}

export interface FacultyData {
  name: string;
  email: string;
  designation?: string;
  subjects?: string[];
}

export interface AnalyzedRow<T> {
  line: number;
  ok: boolean;
  errors: string[];
  name: string;
  email: string;
  /** Roll number for students, designation for faculty. */
  ident: string;
  batch: string | null;
  data?: T;
}

export type OkRow<T> = AnalyzedRow<T> & { data: T };

const LABEL: Record<string, string> = {
  rollNo: "roll_no",
  guardianName: "guardian_name",
  guardianPhone: "guardian_phone",
};

function zodMessages(e: ZodError): string[] {
  return e.issues.map((i) => {
    const key = String(i.path[0] ?? "row");
    const label = LABEL[key] ?? key;
    if (i.message === "Required" || i.message.startsWith("String must contain at least 1")) return `${label} is required`;
    if (i.message === "Invalid email") return `${label} isn't a valid email address`;
    if (i.message === "Invalid") return `${label} isn't in a valid format`;
    return `${label}: ${i.message}`;
  });
}

function requireColumns(parsed: ParsedCsv, required: string[], expected: string) {
  const missing = required.filter((c) => !parsed.columns.includes(c));
  if (missing.length > 0) {
    throw badRequest(`Missing required column(s): ${missing.join(", ")}. Expected headers: ${expected}.`);
  }
}

async function existingEmails(tx: Tx, emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await tx.select({ email: users.email }).from(users).where(inArray(users.email, emails));
  return new Set(rows.map((r) => r.email));
}

export async function analyzeStudents(
  tx: Tx,
  parsed: ParsedCsv,
  defaultBatchId?: string,
): Promise<AnalyzedRow<StudentData>[]> {
  requireColumns(parsed, ["name", "email", "roll_no"], "name, email, roll_no (optional: guardian_name, guardian_phone, batch)");

  const batchRows = await tx
    .select({
      id: batches.id,
      name: batches.name,
      capacity: batches.capacity,
      enrolled: sql<number>`(select count(*)::int from ${enrollments} e where e.batch_id = ${batches.id})`,
    })
    .from(batches);
  const byName = new Map(batchRows.map((b) => [b.name.toLowerCase(), b]));
  const defaultBatch = defaultBatchId ? batchRows.find((b) => b.id === defaultBatchId) : undefined;
  if (defaultBatchId && !defaultBatch) throw notFound("Batch not found");

  const emails = [...new Set(parsed.rows.map((r) => (r.values.email ?? "").toLowerCase()).filter(Boolean))];
  const rolls = [...new Set(parsed.rows.map((r) => r.values.roll_no ?? "").filter(Boolean))];
  const takenEmails = await existingEmails(tx, emails);
  const takenRolls = new Set<string>(
    rolls.length === 0
      ? []
      : (await tx.select({ r: students.rollNo }).from(students).where(inArray(students.rollNo, rolls))).map((x) => x.r),
  );

  const seenEmail = new Map<string, number>();
  const seenRoll = new Map<string, number>();
  const seatsUsed = new Map<string, number>();

  return parsed.rows.map((r): AnalyzedRow<StudentData> => {
    const v = r.values;
    const errors: string[] = [];
    if (r.tooManyColumns) errors.push("Too many columns. A value that contains a comma must be wrapped in quotes.");

    const parsedRow = createStudentSchema.safeParse({
      name: v.name ?? "",
      email: v.email ?? "",
      rollNo: v.roll_no ?? "",
      guardianName: v.guardian_name || undefined,
      guardianPhone: v.guardian_phone || undefined,
    });
    if (!parsedRow.success) errors.push(...zodMessages(parsedRow.error));

    const email = parsedRow.success ? parsedRow.data.email : (v.email ?? "").toLowerCase();
    const rollNo = parsedRow.success ? parsedRow.data.rollNo : (v.roll_no ?? "");

    if (email) {
      const first = seenEmail.get(email);
      if (first !== undefined) errors.push(`This email already appears on line ${first}.`);
      else seenEmail.set(email, r.line);
      if (takenEmails.has(email)) errors.push("A user with this email already exists.");
    }
    if (rollNo) {
      const first = seenRoll.get(rollNo);
      if (first !== undefined) errors.push(`This roll number already appears on line ${first}.`);
      else seenRoll.set(rollNo, r.line);
      if (takenRolls.has(rollNo)) errors.push("A student with this roll number already exists.");
    }

    let batch = defaultBatch;
    let batchLabel = defaultBatch?.name ?? null;
    if (v.batch) {
      batchLabel = v.batch;
      const found = byName.get(v.batch.toLowerCase());
      if (!found) errors.push(`The batch "${v.batch}" doesn't exist.`);
      else batch = found;
    }

    // Seats are only claimed by rows that are otherwise fine.
    if (errors.length === 0 && batch) {
      const used = seatsUsed.get(batch.id) ?? 0;
      if (batch.capacity !== null && batch.enrolled + used >= batch.capacity) {
        errors.push(`The batch "${batch.name}" is full.`);
      } else {
        seatsUsed.set(batch.id, used + 1);
      }
    }

    const ok = errors.length === 0 && parsedRow.success;
    return {
      line: r.line,
      ok,
      errors,
      name: v.name ?? "",
      email,
      ident: rollNo,
      batch: batchLabel,
      data:
        ok && parsedRow.success
          ? {
              name: parsedRow.data.name,
              email: parsedRow.data.email,
              rollNo: parsedRow.data.rollNo,
              guardianName: parsedRow.data.guardianName,
              guardianPhone: parsedRow.data.guardianPhone,
              batchId: batch?.id ?? null,
            }
          : undefined,
    };
  });
}

export async function analyzeFaculty(tx: Tx, parsed: ParsedCsv): Promise<AnalyzedRow<FacultyData>[]> {
  requireColumns(parsed, ["name", "email"], "name, email (optional: designation, subjects)");

  const emails = [...new Set(parsed.rows.map((r) => (r.values.email ?? "").toLowerCase()).filter(Boolean))];
  const takenEmails = await existingEmails(tx, emails);
  const seenEmail = new Map<string, number>();

  return parsed.rows.map((r): AnalyzedRow<FacultyData> => {
    const v = r.values;
    const errors: string[] = [];
    if (r.tooManyColumns) errors.push("Too many columns. A value that contains a comma must be wrapped in quotes.");

    const subjects = (v.subjects ?? "")
      .split(/[;|,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedRow = createFacultySchema.safeParse({
      name: v.name ?? "",
      email: v.email ?? "",
      designation: v.designation || undefined,
      subjects: subjects.length > 0 ? subjects : undefined,
    });
    if (!parsedRow.success) errors.push(...zodMessages(parsedRow.error));

    const email = parsedRow.success ? parsedRow.data.email : (v.email ?? "").toLowerCase();
    if (email) {
      const first = seenEmail.get(email);
      if (first !== undefined) errors.push(`This email already appears on line ${first}.`);
      else seenEmail.set(email, r.line);
      if (takenEmails.has(email)) errors.push("A user with this email already exists.");
    }

    const ok = errors.length === 0 && parsedRow.success;
    return {
      line: r.line,
      ok,
      errors,
      name: v.name ?? "",
      email,
      ident: v.designation ?? "",
      batch: null,
      data:
        ok && parsedRow.success
          ? {
              name: parsedRow.data.name,
              email: parsedRow.data.email,
              designation: parsedRow.data.designation,
              subjects: parsedRow.data.subjects,
            }
          : undefined,
    };
  });
}
