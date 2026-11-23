import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  bigint,
  boolean,
  jsonb,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { QUESTION_TYPES, EXAM_STATUS, SESSION_STATUS } from "@shiksha/shared";
import { pk, createdAt, tenantCol, users, students, batches } from "./core";

export const questionTypeEnum = pgEnum("question_type", QUESTION_TYPES);
export const examStatusEnum = pgEnum("exam_status", EXAM_STATUS);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUS);

export const questions = pgTable("questions", {
  id: pk(),
  tenantId: tenantCol(),
  subject: text("subject").notNull(),
  topic: text("topic"),
  type: questionTypeEnum("type").notNull().default("single_choice"),
  body: text("body").notNull(),
  options: jsonb("options").$type<{ id: string; text: string }[]>(),
  correct: jsonb("correct").$type<string[]>().notNull(),
  marks: real("marks").notNull().default(4),
  negativeMarks: real("negative_marks").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const exams = pgTable("exams", {
  id: pk(),
  tenantId: tenantCol(),
  title: text("title").notNull(),
  batchId: uuid("batch_id").references(() => batches.id),
  durationMinutes: integer("duration_minutes").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: examStatusEnum("status").notNull().default("draft"),
  shuffle: boolean("shuffle").notNull().default(true),
  resultsReleased: boolean("results_released").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const examQuestions = pgTable(
  "exam_questions",
  {
    id: pk(),
    tenantId: tenantCol(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    position: integer("position").notNull(),
  },
  (t) => [unique("exam_questions_uq").on(t.examId, t.questionId)],
);

/** deadline_at is computed and owned by the server. The client never sets it. */
export const examSessions = pgTable(
  "exam_sessions",
  {
    id: pk(),
    tenantId: tenantCol(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    status: sessionStatusEnum("status").notNull().default("in_progress"),
    score: real("score"),
  },
  (t) => [unique("exam_sessions_exam_student_uq").on(t.examId, t.studentId)],
);

/** Idempotent sync target: the highest client_seq per (session, question) wins. */
export const examAnswers = pgTable(
  "exam_answers",
  {
    id: pk(),
    tenantId: tenantCol(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    response: jsonb("response").$type<string | number | string[] | null>(),
    markedForReview: boolean("marked_for_review").notNull().default(false),
    late: boolean("late").notNull().default(false),
    clientSeq: integer("client_seq").notNull(),
    clientTs: bigint("client_ts", { mode: "number" }).notNull(),
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("exam_answers_session_question_uq").on(t.sessionId, t.questionId),
    index("exam_answers_tenant_idx").on(t.tenantId),
  ],
);
