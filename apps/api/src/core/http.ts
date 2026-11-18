import { z } from "zod";
import { AppError } from "./errors";

export const idParams = z.object({ id: z.string().uuid() });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

export const conflict = (msg: string) => new AppError(409, "conflict", msg);

/** Postgres error code, whether the driver error is wrapped or not. */
export function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code ?? err?.cause?.code;
}

/** Turns a unique-constraint violation (23505) into a 409; rethrows everything else. */
export function rethrowUnique(e: unknown, message: string): never {
  if (pgCode(e) === "23505") throw conflict(message);
  throw e;
}

/** Builds an ILIKE pattern with the user's %, _ and \ escaped. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
