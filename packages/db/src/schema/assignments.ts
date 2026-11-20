import { pgTable, uuid, unique } from "drizzle-orm/pg-core";
import { pk, createdAt, tenantCol, batches, faculty } from "./core";

/** Which teachers teach which batch. Teachers only see batches they are assigned to. */
export const batchTeachers = pgTable(
  "batch_teachers",
  {
    id: pk(),
    tenantId: tenantCol(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    facultyId: uuid("faculty_id")
      .notNull()
      .references(() => faculty.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("batch_teachers_uq").on(t.batchId, t.facultyId)],
);
