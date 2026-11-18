import type { FastifyRequest } from "fastify";
import type { Role } from "@shiksha/shared";
import { authenticate } from "./auth";
import { forbidden } from "./errors";

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest): Promise<void> => {
    await authenticate(req);
    if (!roles.includes(req.auth!.role)) throw forbidden();
  };
}
