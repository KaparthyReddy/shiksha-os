export const ROLES = ["admin", "teacher", "student"] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_STATUS = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];

export const INVOICE_STATUS = ["pending", "partial", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const PAYMENT_METHOD = [
  "cash",
  "upi",
  "card",
  "netbanking",
  "bank_transfer",
  "razorpay",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export const QUESTION_TYPES = ["single_choice", "multi_choice", "numeric"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const EXAM_STATUS = ["draft", "published", "closed"] as const;
export type ExamStatus = (typeof EXAM_STATUS)[number];

export const SESSION_STATUS = ["in_progress", "submitted", "expired"] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];
