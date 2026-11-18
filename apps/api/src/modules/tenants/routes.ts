import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tenants, eq } from "@shiksha/db";
import { authenticate } from "../../core/auth";
import { requireRole } from "../../core/rbac";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { notFound } from "../../core/errors";

export async function tenantRoutes(app: FastifyInstance) {
  app.get("/tenant", { preHandler: authenticate }, async (req) => {
    const [t] = await app.db.select().from(tenants).where(eq(tenants.id, req.auth!.tenantId)).limit(1);
    if (!t) throw notFound("Tenant not found");
    return t;
  });

  app.patch("/tenant", { preHandler: requireRole("admin") }, async (req) => {
    const body = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body);
    const { tenantId, userId } = req.auth!;
    return inTenant(req, async (tx) => {
      const [t] = await tx.update(tenants).set({ name: body.name }).where(eq(tenants.id, tenantId)).returning();
      await writeAudit(tx, tenantId, {
        actorId: userId,
        action: "tenant.update",
        entity: "tenant",
        entityId: tenantId,
        payload: { fields: ["name"] },
      });
      return t;
    });
  });
}
