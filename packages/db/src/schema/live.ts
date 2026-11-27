import { pgTable, pgEnum, uuid, text, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { pk, createdAt, tenantCol, users, batches } from "./core";

export const liveStatusEnum = pgEnum("live_class_status", ["scheduled", "live", "ended", "cancelled"]);

export const liveClasses = pgTable(
  "live_classes",
  {
    id: pk(),
    tenantId: tenantCol(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: liveStatusEnum("status").notNull().default("scheduled"),
    createdBy: uuid("created_by").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("live_classes_tenant_idx").on(t.tenantId, t.scheduledAt)],
);

/** Who joined a class and for how long. Seconds are added up from LiveKit's join and leave webhooks. */
export const liveParticipants = pgTable(
  "live_class_participants",
  {
    id: pk(),
    tenantId: tenantCol(),
    liveClassId: uuid("live_class_id")
      .notNull()
      .references(() => liveClasses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstJoinedAt: timestamp("first_joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastJoinedAt: timestamp("last_joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastLeftAt: timestamp("last_left_at", { withTimezone: true }),
    /** Set while the person is connected; cleared (and added to totalSeconds) when they leave. */
    openSince: timestamp("open_since", { withTimezone: true }),
    totalSeconds: integer("total_seconds").notNull().default(0),
    joinCount: integer("join_count").notNull().default(0),
  },
  (t) => [unique("live_participants_uq").on(t.liveClassId, t.userId)],
);
