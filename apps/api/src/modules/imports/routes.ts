import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { faculty, students, users } from "@shiksha/db";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { AppError, badRequest } from "../../core/errors";
import { pgCode } from "../../core/http";
import { generateTempPassword, hashPassword } from "../../core/passwords";
import { enrollStudent } from "../academics/enroll";
import { CsvError, parseCsv, type Aliases } from "./csv";
import {
  FACULTY_ALIASES,
  STUDENT_ALIASES,
  analyzeFaculty,
  analyzeStudents,
  type AnalyzedRow,
  type FacultyData,
  type OkRow,
  type StudentData,
} from "./analyze";

const admin = requireRole("admin");

const body = z.object({
  csv: z.string().min(1).max(900_000),
  batchId: z.string().uuid().optional(),
});

function parse(csv: string, aliases: Aliases) {
  try {
    return parseCsv(csv, aliases);
  } catch (e) {
    if (e instanceof CsvError) throw badRequest(e.message);
    throw e;
  }
}

const view = (r: AnalyzedRow<unknown>) => ({
  line: r.line,
  ok: r.ok,
  errors: r.errors,
  name: r.name,
  email: r.email,
  ident: r.ident,
  batch: r.batch,
});

const skippedView = (r: { line: number; name: string; email: string; ident: string }, errors: string[]) => ({
  line: r.line,
  name: r.name,
  email: r.email,
  ident: r.ident,
  errors,
});

/** Temporary passwords are generated and hashed before the transaction opens, so it stays short. */
async function makePasswords(n: number) {
  const out: { plain: string; hash: string }[] = [];
  for (let i = 0; i < n; i += 25) {
    const chunk = await Promise.all(
      Array.from({ length: Math.min(25, n - i) }, async () => {
        const plain = generateTempPassword();
        return { plain, hash: await hashPassword(plain) };
      }),
    );
    out.push(...chunk);
  }
  return out;
}

const previewLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };
const importLimit = { rateLimit: { max: 6, timeWindow: "1 minute" } };

export async function importRoutes(app: FastifyInstance) {
  // ======================= Students =======================
  app.post("/imports/students/preview", { preHandler: admin, config: previewLimit }, async (req) => {
    const input = body.parse(req.body);
    const parsed = parse(input.csv, STUDENT_ALIASES);
    const rows = await inTenant(req, (tx) => analyzeStudents(tx, parsed, input.batchId));
    return {
      summary: { total: rows.length, valid: rows.filter((r) => r.ok).length, invalid: rows.filter((r) => !r.ok).length },
      ignoredColumns: parsed.ignoredColumns,
      rows: rows.map(view),
    };
  });

  app.post("/imports/students", { preHandler: admin, config: importLimit }, async (req) => {
    const input = body.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const parsed = parse(input.csv, STUDENT_ALIASES);

    const analysis = await inTenant(req, (tx) => analyzeStudents(tx, parsed, input.batchId));
    const todo = analysis.filter((r): r is OkRow<StudentData> => r.ok && r.data !== undefined);
    const passwords = await makePasswords(todo.length);

    const outcome = await inTenant(req, async (tx) => {
      const created: { line: number; name: string; email: string; ident: string; temporaryPassword: string }[] = [];
      const failed: ReturnType<typeof skippedView>[] = [];

      for (const [i, row] of todo.entries()) {
        const d = row.data;
        try {
          // Each row gets its own savepoint, so one failure rolls back only that row.
          await tx.transaction(async (sp) => {
            const [u] = await sp
              .insert(users)
              .values({ tenantId, email: d.email, passwordHash: passwords[i]!.hash, name: d.name, role: "student" })
              .returning({ id: users.id });
            const [s] = await sp
              .insert(students)
              .values({
                tenantId,
                userId: u!.id,
                rollNo: d.rollNo,
                guardianName: d.guardianName,
                guardianPhone: d.guardianPhone,
              })
              .returning({ id: students.id });
            if (d.batchId) await enrollStudent(sp, tenantId, d.batchId, s!.id);
          });
          created.push({ line: row.line, name: d.name, email: d.email, ident: d.rollNo, temporaryPassword: passwords[i]!.plain });
        } catch (e) {
          if (pgCode(e) === "23505") failed.push(skippedView(row, ["This email or roll number was taken while importing."]));
          else if (e instanceof AppError) failed.push(skippedView(row, [e.message]));
          else throw e;
        }
      }

      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: "import.students",
        entity: "import",
        payload: { created: created.length, skipped: analysis.length - created.length },
      });
      return { created, failed };
    });

    const skipped = [
      ...analysis.filter((r) => !r.ok).map((r) => skippedView(r, r.errors)),
      ...outcome.failed,
    ].sort((a, b) => a.line - b.line);
    return {
      summary: { total: analysis.length, created: outcome.created.length, skipped: skipped.length },
      created: outcome.created,
      skipped,
    };
  });

  // ======================= Faculty =======================
  app.post("/imports/faculty/preview", { preHandler: admin, config: previewLimit }, async (req) => {
    const input = body.parse(req.body);
    const parsed = parse(input.csv, FACULTY_ALIASES);
    const rows = await inTenant(req, (tx) => analyzeFaculty(tx, parsed));
    return {
      summary: { total: rows.length, valid: rows.filter((r) => r.ok).length, invalid: rows.filter((r) => !r.ok).length },
      ignoredColumns: parsed.ignoredColumns,
      rows: rows.map(view),
    };
  });

  app.post("/imports/faculty", { preHandler: admin, config: importLimit }, async (req) => {
    const input = body.parse(req.body);
    const { tenantId, userId } = req.auth!;
    const parsed = parse(input.csv, FACULTY_ALIASES);

    const analysis = await inTenant(req, (tx) => analyzeFaculty(tx, parsed));
    const todo = analysis.filter((r): r is OkRow<FacultyData> => r.ok && r.data !== undefined);
    const passwords = await makePasswords(todo.length);

    const outcome = await inTenant(req, async (tx) => {
      const created: { line: number; name: string; email: string; ident: string; temporaryPassword: string }[] = [];
      const failed: ReturnType<typeof skippedView>[] = [];

      for (const [i, row] of todo.entries()) {
        const d = row.data;
        try {
          await tx.transaction(async (sp) => {
            const [u] = await sp
              .insert(users)
              .values({ tenantId, email: d.email, passwordHash: passwords[i]!.hash, name: d.name, role: "teacher" })
              .returning({ id: users.id });
            await sp.insert(faculty).values({
              tenantId,
              userId: u!.id,
              designation: d.designation,
              subjects: d.subjects,
            });
          });
          created.push({ line: row.line, name: d.name, email: d.email, ident: d.designation ?? "", temporaryPassword: passwords[i]!.plain });
        } catch (e) {
          if (pgCode(e) === "23505") failed.push(skippedView(row, ["This email was taken while importing."]));
          else if (e instanceof AppError) failed.push(skippedView(row, [e.message]));
          else throw e;
        }
      }

      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: "import.faculty",
        entity: "import",
        payload: { created: created.length, skipped: analysis.length - created.length },
      });
      return { created, failed };
    });

    const skipped = [
      ...analysis.filter((r) => !r.ok).map((r) => skippedView(r, r.errors)),
      ...outcome.failed,
    ].sort((a, b) => a.line - b.line);
    return {
      summary: { total: analysis.length, created: outcome.created.length, skipped: skipped.length },
      created: outcome.created,
      skipped,
    };
  });
}
