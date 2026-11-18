import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { pk, createdAt, tenantCol, users } from "./core";

/**
 * Opaque refresh tokens, stored as SHA-256 hashes. Each use rotates the token within a family;
 * presenting an already-rotated token outside the grace window revokes the whole family.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("refresh_tokens_user_idx").on(t.userId),
    index("refresh_tokens_family_idx").on(t.familyId),
  ],
);
