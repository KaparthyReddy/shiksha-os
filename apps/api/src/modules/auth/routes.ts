import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { loginSchema } from "@shiksha/shared";
import { tenants, users, eq, and, withTenant } from "@shiksha/db";
import { authenticate, issueTokens, verifyRefresh } from "../../core/auth";
import { unauthorized } from "../../core/errors";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";

// Verified against when the tenant or user doesn't exist, so response time doesn't reveal which.
const DUMMY_HASH = hash("not-a-real-password");

async function passwordMatches(storedHash: string | undefined, password: string): Promise<boolean> {
  try {
    return await verify(storedHash ?? (await DUMMY_HASH), password);
  } catch {
    return false;
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const input = loginSchema.parse(req.body);

      const [tenant] = await app.db.select().from(tenants).where(eq(tenants.slug, input.tenant)).limit(1);

      const user = tenant
        ? await withTenant(app.db, tenant.id, async (tx) => {
            const [u] = await tx
              .select()
              .from(users)
              .where(and(eq(users.email, input.email), eq(users.isActive, true)))
              .limit(1);
            return u;
          })
        : undefined;

      const ok = await passwordMatches(user?.passwordHash, input.password);
      if (!tenant || !user || !ok) throw unauthorized("Invalid credentials");

      await withTenant(app.db, tenant.id, (tx) =>
        writeAudit(tx, tenant.id, { actorId: user.id, action: "auth.login", entity: "user", entityId: user.id }),
      );

      const tokens = await issueTokens({ userId: user.id, tenantId: tenant.id, role: user.role });
      return {
        ...tokens,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { slug: tenant.slug, name: tenant.name },
      };
    },
  );

  app.post("/auth/refresh", async (req) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    let ctx;
    try {
      ctx = await verifyRefresh(refreshToken);
    } catch {
      throw unauthorized("Invalid or expired refresh token");
    }
    const user = await withTenant(app.db, ctx.tenantId, async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
      return u;
    });
    if (!user || !user.isActive) throw unauthorized("Account is disabled");
    return issueTokens({ userId: user.id, tenantId: ctx.tenantId, role: user.role });
  });

  app.get("/auth/me", { preHandler: authenticate }, async (req) => {
    const [u] = await inTenant(req, (tx) =>
      tx
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, req.auth!.userId))
        .limit(1),
    );
    if (!u) throw unauthorized();
    return { ...u, tenantId: req.auth!.tenantId };
  });
}
