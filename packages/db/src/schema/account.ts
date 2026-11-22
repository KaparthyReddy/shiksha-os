import { pgTable, bigserial, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { pk, createdAt, tenantCol, users } from "./core";

/** One-time password-reset links. Only a hash of the token is stored. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/** Emails waiting for the worker. The body is blanked once sent, so a reset link isn't kept. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantCol(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_outbox_pending_idx").on(t.tenantId, t.status, t.id)],
);
