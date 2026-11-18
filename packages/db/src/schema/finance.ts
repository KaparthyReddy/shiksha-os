import { pgTable, pgEnum, uuid, text, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { INVOICE_STATUS, PAYMENT_METHOD } from "@shiksha/shared";
import { pk, createdAt, tenantCol, students, users } from "./core";

export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUS);
export const paymentMethodEnum = pgEnum("payment_method", PAYMENT_METHOD);

// All money is stored as integer paise (₹1 = 100). Never floats.
export const feePlans = pgTable("fee_plans", {
  id: pk(),
  tenantId: tenantCol(),
  name: text("name").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    tenantId: tenantCol(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    feePlanId: uuid("fee_plan_id").references(() => feePlans.id),
    amountPaise: integer("amount_paise").notNull(),
    dueOn: date("due_on"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_tenant_idx").on(t.tenantId)],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    tenantId: tenantCol(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountPaise: integer("amount_paise").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference"),
    receiptNo: text("receipt_no").notNull(),
    receivedBy: uuid("received_by").references(() => users.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    receiptEmailedAt: timestamp("receipt_emailed_at", { withTimezone: true }),
  },
  (t) => [index("payments_tenant_idx").on(t.tenantId)],
);
