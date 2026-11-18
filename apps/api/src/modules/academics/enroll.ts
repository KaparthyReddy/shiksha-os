import { batches, enrollments, eq, sql, type Tx } from "@shiksha/db";
import { notFound } from "../../core/errors";
import { conflict } from "../../core/http";

/**
 * Enrolls a student in a batch inside the caller's transaction. Locks the batch row so two
 * concurrent enrollments can't both take the last seat.
 */
export async function enrollStudent(tx: Tx, tenantId: string, batchId: string, studentId: string) {
  const [batch] = await tx
    .select({ id: batches.id, capacity: batches.capacity })
    .from(batches)
    .where(eq(batches.id, batchId))
    .for("update");
  if (!batch) throw notFound("Batch not found");

  const [c] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(eq(enrollments.batchId, batchId));
  if (batch.capacity != null && (c?.n ?? 0) >= batch.capacity) throw conflict("Batch is full");

  await tx.insert(enrollments).values({ tenantId, batchId, studentId });
}
