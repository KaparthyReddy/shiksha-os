import { batches, batchTeachers, faculty, eq, and, inArray, type Tx } from "@shiksha/db";
import type { AuthContext } from "./auth";
import { notFound } from "./errors";

/** Restricts a query on `batches` to the caller's own batches when they are a teacher. Admins see everything. */
export function teacherBatchScope(tx: Tx, auth: AuthContext) {
  if (auth.role !== "teacher") return undefined;
  return inArray(
    batches.id,
    tx
      .select({ id: batchTeachers.batchId })
      .from(batchTeachers)
      .innerJoin(faculty, eq(faculty.id, batchTeachers.facultyId))
      .where(eq(faculty.userId, auth.userId)),
  );
}

/** 404s when the batch doesn't exist, or when a teacher isn't assigned to it (no hint which). */
export async function requireBatchAccess(tx: Tx, auth: AuthContext, batchId: string): Promise<void> {
  const [b] = await tx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), teacherBatchScope(tx, auth)))
    .limit(1);
  if (!b) throw notFound("Batch not found");
}
