import type { FastifyInstance } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { tenants, users, passwordResets, emailOutbox, withTenant, eq, and, isNull, gte, sql } from "@shiksha/db";
import { authenticate, issueAccessToken } from "../../core/auth";
import { AppError, badRequest, unauthorized } from "../../core/errors";
import { inTenant } from "../../core/tenancy";
import { writeAudit } from "../../core/audit";
import { passwordProblem } from "../../core/password-policy";
import { env } from "../../env";
import { issueRefreshToken, revokeAllRefreshTokens } from "./sessions";
import { hashToken, parseRefreshToken } from "./tokens";

const RESET_TTL_MS = 60 * 60_000;
const MAX_RESETS_PER_HOUR = 3;

async function matches(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

const changeBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});
const forgotBody = z.object({
  tenant: z.string().min(2).max(64).toLowerCase(),
  email: z.string().email().toLowerCase(),
});
const resetBody = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(1).max(128),
});

export async function accountRoutes(app: FastifyInstance) {
  // ---------- Change password (signed in) ----------
  app.post(
    "/auth/change-password",
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const body = changeBody.parse(req.body);
      const { tenantId, userId, role } = req.auth!;

      const [user] = await inTenant(req, (tx) => tx.select().from(users).where(eq(users.id, userId)).limit(1));
      if (!user || !user.isActive) throw unauthorized();

      // A wrong current password is a 400, not a 401, so the web app doesn't treat it as a lapsed session.
      if (!(await matches(user.passwordHash, body.currentPassword))) {
        throw new AppError(400, "wrong_password", "Your current password is incorrect.");
      }
      if (body.newPassword === body.currentPassword) {
        throw badRequest("Choose a password different from your current one.");
      }
      const problem = passwordProblem(body.newPassword, user.email);
      if (problem) throw badRequest(problem);

      const newHash = await hash(body.newPassword);

      // Every device is signed out; this one gets a fresh session in the same response.
      const refreshToken = await inTenant(req, async (tx) => {
        await tx.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
        await revokeAllRefreshTokens(tx, userId);
        await writeAudit(tx, tenantId, { actorId: userId, action: "auth.password_change", entity: "user", entityId: userId });
        return issueRefreshToken(tx, { tenantId, userId, familyId: randomUUID() });
      });
      return { accessToken: await issueAccessToken({ userId, tenantId, role }), refreshToken };
    },
  );

  // ---------- Forgot password (public) ----------
  app.post(
    "/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const input = forgotBody.parse(req.body);
      const [tenant] = await app.db.select().from(tenants).where(eq(tenants.slug, input.tenant)).limit(1);

      if (tenant) {
        await withTenant(app.db, tenant.id, async (tx) => {
          const [u] = await tx
            .select()
            .from(users)
            .where(and(eq(users.email, input.email), eq(users.isActive, true)))
            .limit(1);
          if (!u) return;

          const [recent] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(passwordResets)
            .where(and(eq(passwordResets.userId, u.id), gte(passwordResets.createdAt, new Date(Date.now() - 3_600_000))));
          if ((recent?.n ?? 0) >= MAX_RESETS_PER_HOUR) return;

          // A new link cancels any earlier unused one.
          await tx
            .update(passwordResets)
            .set({ usedAt: new Date() })
            .where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt)));

          const raw = `${tenant.id}.${randomBytes(32).toString("base64url")}`;
          await tx.insert(passwordResets).values({
            tenantId: tenant.id,
            userId: u.id,
            tokenHash: hashToken(raw),
            expiresAt: new Date(Date.now() + RESET_TTL_MS),
          });
          await tx.insert(emailOutbox).values({
            tenantId: tenant.id,
            toEmail: u.email,
            subject: `Reset your ${tenant.name} password`,
            bodyText: [
              `Hi ${u.name},`,
              "",
              "Someone asked to reset your password. Use this link within 1 hour:",
              "",
              `${env.WEB_URL}/reset-password?token=${raw}`,
              "",
              "If this wasn't you, ignore this email. Your password stays the same.",
            ].join("\n"),
          });
          await writeAudit(tx, tenant.id, {
            actorId: u.id,
            action: "auth.password_reset_requested",
            entity: "user",
            entityId: u.id,
          });
        });
      }
      // Same answer whether or not the account exists.
      return { ok: true };
    },
  );

  // ---------- Reset password (public, with the emailed token) ----------
  app.post(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const { token, newPassword } = resetBody.parse(req.body);
      const invalid = () => new AppError(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");

      const parsed = parseRefreshToken(token);
      if (!parsed) throw invalid();
      const weak = passwordProblem(newPassword);
      if (weak) throw badRequest(weak);
      const newHash = await hash(newPassword);

      return withTenant(app.db, parsed.tenantId, async (tx) => {
        const [row] = await tx.select().from(passwordResets).where(eq(passwordResets.tokenHash, hashToken(token))).for("update");
        if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw invalid();

        const [u] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
        if (!u || !u.isActive) throw invalid();
        if (newPassword.toLowerCase() === u.email) throw badRequest("Your password can't be your email address.");

        await tx.update(users).set({ passwordHash: newHash }).where(eq(users.id, u.id));
        await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
        await revokeAllRefreshTokens(tx, u.id);
        await writeAudit(tx, parsed.tenantId, { actorId: u.id, action: "auth.password_reset", entity: "user", entityId: u.id });
        return { ok: true };
      });
    },
  );
}
