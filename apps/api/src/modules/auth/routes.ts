import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { loginSchema } from "@shiksha/shared";
import { tenants, users, eq, and, withTenant } from "@shiksha/db";
import { authenticate, issueAccessToken } from "../../core/auth";
import { unauthorized } from "../../core/errors";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { issueRefreshToken, revokeRefreshFamily, rotateRefreshToken } from "./sessions";

// Verified against when the tenant or user doesn't exist, so response time doesn't reveal which.
const DUMMY_HASH = hash("not-a-real-password");

async function passwordMatches(storedHash: string | undefined, password: string): Promise<boolean> {
  try {
    return await verify(storedHash ?? (await DUMMY_HASH), password);
  } catch {
    return false;
  }
}

const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

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

      // A fresh login starts a new token family.
      const refreshToken = await withTenant(app.db, tenant.id, async (tx) => {
        await writeAudit(tx, tenant.id, { actorId: user.id, action: "auth.login", entity: "user", entityId: user.id });
        return issueRefreshToken(tx, { tenantId: tenant.id, userId: user.id, familyId: randomUUID() });
      });

      const accessToken = await issueAccessToken({ userId: user.id, tenantId: tenant.id, role: user.role });
      return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        tenant: { slug: tenant.slug, name: tenant.name },
      };
    },
  );

  app.post(
    "/auth/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const { refreshToken } = refreshBody.parse(req.body);
      const r = await rotateRefreshToken(app.db, refreshToken);
      if (r.kind === "invalid") throw unauthorized("Invalid or expired refresh token");
      return { accessToken: await issueAccessToken(r.ctx), refreshToken: r.refreshToken };
    },
  );

  app.post(
    "/auth/logout",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const { refreshToken } = refreshBody.parse(req.body);
      await revokeRefreshFamily(app.db, refreshToken);
      return { ok: true };
    },
  );

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
