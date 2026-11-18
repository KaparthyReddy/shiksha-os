import { pgTable, bigserial, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenantCol } from "./core";

/**
 * Append-only, hash-chained per tenant: hash = sha256(prev_hash + canonical(row)).
 * Editing or deleting any row breaks every later hash, so tampering is detectable.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantCol(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId, t.id)],
);
