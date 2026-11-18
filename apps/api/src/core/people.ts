import { students, eq, type Tx } from "@shiksha/db";
import { forbidden } from "./errors";

export async function studentIdOf(tx: Tx, userId: string): Promise<string> {
  const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  if (!s) throw forbidden("No student profile for this account");
  return s.id;
}
