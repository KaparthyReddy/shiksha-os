import { auditLog, eq, asc, desc, sql, type Tx } from "@shiksha/db";
import { GENESIS_HASH, computeHash } from "./audit-hash";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
}

/**
 * Appends one hash-chained entry. Call inside the same transaction as the change it records,
 * so the change and its audit record commit or roll back together.
 */
export async function writeAudit(tx: Tx, tenantId: string, input: AuditInput): Promise<void> {
  // Serialize writers per tenant so two concurrent writes can't fork the chain.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"audit:" + tenantId}))`);

  const [last] = await tx
    .select({ hash: auditLog.hash })
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(desc(auditLog.id))
    .limit(1);

  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  const payload = input.payload === undefined ? null : JSON.parse(JSON.stringify(input.payload));
  const entry = {
    tenantId,
    actorId: input.actorId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    payload,
    createdAt: createdAt.toISOString(),
  };

  await tx.insert(auditLog).values({
    tenantId,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    payload,
    prevHash,
    hash: computeHash(prevHash, entry),
    createdAt,
  });
}

export type ChainResult =
  | { ok: true; entries: number }
  | { ok: false; brokenAtId: number; reason: "prev_hash_mismatch" | "hash_mismatch" };

export async function verifyAuditChain(tx: Tx, tenantId: string): Promise<ChainResult> {
  const rows = await tx
    .select()
    .from(auditLog)
    .where(eq(auditLog.tenantId, tenantId))
    .orderBy(asc(auditLog.id));

  let prev = GENESIS_HASH;
  for (const r of rows) {
    if (r.prevHash !== prev) return { ok: false, brokenAtId: r.id, reason: "prev_hash_mismatch" };
    const expected = computeHash(prev, {
      tenantId: r.tenantId,
      actorId: r.actorId,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    });
    if (expected !== r.hash) return { ok: false, brokenAtId: r.id, reason: "hash_mismatch" };
    prev = r.hash;
  }
  return { ok: true, entries: rows.length };
}
