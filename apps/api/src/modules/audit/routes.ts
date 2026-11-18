import type { FastifyInstance } from "fastify";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { verifyAuditChain } from "../../core/audit";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit/verify", { preHandler: requireRole("admin") }, async (req) =>
    inTenant(req, (tx) => verifyAuditChain(tx, req.auth!.tenantId)),
  );
}
