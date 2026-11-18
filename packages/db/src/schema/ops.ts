import { pgTable, bigserial, bigint, integer, boolean, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenantCol } from "./core";

/**
 * Periodic snapshots of each tenant's audit-chain head, so deleting the newest entries
 * can be detected. Append-only for the app role (see rls.sql).
 */
export const auditAnchors = pgTable(
  "audit_anchors",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantCol(),
    lastAuditId: bigint("last_audit_id", { mode: "number" }).notNull(),
    headHash: text("head_hash").notNull(),
    entries: integer("entries").notNull(),
    ok: boolean("ok").notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_anchors_tenant_idx").on(t.tenantId, t.lastAuditId)],
);
