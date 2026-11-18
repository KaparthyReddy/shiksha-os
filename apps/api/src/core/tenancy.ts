import type { FastifyRequest } from "fastify";
import { withTenant, type Tx } from "@shiksha/db";
import { unauthorized } from "./errors";

/** Runs fn in a transaction locked to the caller's tenant. RLS does the rest. */
export function inTenant<T>(req: FastifyRequest, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!req.auth) throw unauthorized();
  return withTenant(req.server.db, req.auth.tenantId, fn);
}
