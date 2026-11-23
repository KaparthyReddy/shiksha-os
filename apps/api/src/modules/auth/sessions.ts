import { refreshTokens, users, withTenant, eq, and, isNull, type Db, type Tx } from "@shiksha/db";
import type { AuthContext } from "../../core/auth";
import { REFRESH_TTL_MS, classifyUse, hashToken, newRefreshToken, parseRefreshToken } from "./tokens";

export async function issueRefreshToken(
  tx: Tx,
  p: { tenantId: string; userId: string; familyId: string },
  now = Date.now(),
): Promise<string> {
  const t = newRefreshToken(p.tenantId);
  await tx.insert(refreshTokens).values({
    tenantId: p.tenantId,
    userId: p.userId,
    familyId: p.familyId,
    tokenHash: t.hash,
    expiresAt: new Date(now + REFRESH_TTL_MS),
  });
  return t.raw;
}

export type RotateResult =
  | { kind: "ok"; refreshToken: string; ctx: AuthContext }
  | { kind: "invalid" };

/**
 * Exchanges a refresh token for a new one. The row is locked, so concurrent refreshes queue up.
 * Revocations happen on a normal return (not a throw), so they commit.
 */
export async function rotateRefreshToken(db: Db, raw: string, now = Date.now()): Promise<RotateResult> {
  const parsed = parseRefreshToken(raw);
  if (!parsed) return { kind: "invalid" };
  const { tenantId } = parsed;

  return withTenant(db, tenantId, async (tx): Promise<RotateResult> => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(raw)))
      .for("update");
    if (!row || row.revokedAt || row.expiresAt.getTime() <= now) return { kind: "invalid" };

    const revokeFamily = () =>
      tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(now) })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));

    if (classifyUse(row.usedAt?.getTime() ?? null, now) === "reuse") {
      await revokeFamily();
      return { kind: "invalid" };
    }

    const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user || !user.isActive) {
      await revokeFamily();
      return { kind: "invalid" };
    }

    if (!row.usedAt) {
      await tx.update(refreshTokens).set({ usedAt: new Date(now) }).where(eq(refreshTokens.id, row.id));
    }
    const refreshToken = await issueRefreshToken(
      tx,
      { tenantId, userId: row.userId, familyId: row.familyId },
      now,
    );
    return { kind: "ok", refreshToken, ctx: { userId: user.id, tenantId, role: user.role } };
  });
}

export async function revokeRefreshFamily(db: Db, raw: string, now = Date.now()): Promise<void> {
  const parsed = parseRefreshToken(raw);
  if (!parsed) return;
  await withTenant(db, parsed.tenantId, async (tx) => {
    const [row] = await tx
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(raw)))
      .limit(1);
    if (!row) return;
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(now) })
      .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
  });
}

/** Kills every refresh token a user holds, so every signed-in device must sign in again. */
export async function revokeAllRefreshTokens(tx: Tx, userId: string, now = Date.now()): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(now) })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
