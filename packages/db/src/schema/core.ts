import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { ROLES, ATTENDANCE_STATUS } from "@shiksha/shared";

export const roleEnum = pgEnum("user_role", ROLES);
export const attendanceStatusEnum = pgEnum("attendance_status", ATTENDANCE_STATUS);

export const pk = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** Every tenant-scoped table uses this column; rls.sql finds tables by it. */
export const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const users = pgTable(
  "users",
  {
    id: pk(),
    tenantId: tenantCol(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("users_tenant_email_uq").on(t.tenantId, t.email)],
);

export const courses = pgTable(
  "courses",
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("courses_tenant_code_uq").on(t.tenantId, t.code)],
);

export const batches = pgTable("batches", {
  id: pk(),
  tenantId: tenantCol(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  capacity: integer("capacity"),
  createdAt: createdAt(),
});

export const students = pgTable(
  "students",
  {
    id: pk(),
    tenantId: tenantCol(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    rollNo: text("roll_no").notNull(),
    guardianName: text("guardian_name"),
    guardianPhone: text("guardian_phone"),
    createdAt: createdAt(),
  },
  (t) => [unique("students_tenant_roll_uq").on(t.tenantId, t.rollNo)],
);

export const faculty = pgTable("faculty", {
  id: pk(),
  tenantId: tenantCol(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  designation: text("designation"),
  subjects: text("subjects").array(),
  createdAt: createdAt(),
});

export const enrollments = pgTable(
  "enrollments",
  {
    id: pk(),
    tenantId: tenantCol(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    enrolledAt: createdAt(),
  },
  (t) => [unique("enrollments_batch_student_uq").on(t.batchId, t.studentId)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: pk(),
    tenantId: tenantCol(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    markedBy: uuid("marked_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("attendance_batch_student_date_uq").on(t.batchId, t.studentId, t.date),
    index("attendance_tenant_idx").on(t.tenantId),
  ],
);
