import { createHash, randomBytes } from "node:crypto";

export const REFRESH_TTL_MS = 7 * 24 * 3600_000;
/** A just-rotated token may be presented again for this long (two tabs refreshing at once). */
export const REUSE_GRACE_MS = 10_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** The tenant id prefix lets us look the token up under that tenant's RLS before we know who the user is. */
export function newRefreshToken(tenantId: string) {
  const raw = `${tenantId}.${randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashToken(raw) };
}

export function parseRefreshToken(raw: string): { tenantId: string } | null {
  const parts = raw.split(".");
  if (parts.length !== 2 || !UUID.test(parts[0]!) || parts[1]!.length < 20) return null;
  return { tenantId: parts[0]! };
}

export type Use = "fresh" | "within_grace" | "reuse";

export function classifyUse(usedAtMs: number | null, nowMs: number): Use {
  if (usedAtMs === null) return "fresh";
  return nowMs - usedAtMs <= REUSE_GRACE_MS ? "within_grace" : "reuse";
}
