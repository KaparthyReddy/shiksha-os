export interface Me {
  id: string;
  name: string;
  email: string;
  role: "admin" | "teacher" | "student";
  tenantId: string;
}
export interface Tenant {
  id: string;
  slug: string;
  name: string;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface BatchRow {
  id: string;
  name: string;
  courseName: string;
  capacity: number | null;
  enrolled: number;
}
export interface FeesSummary {
  invoicedPaise: number;
  collectedPaise: number;
  pendingPaise: number;
  overdueCount: number;
}
export interface ExamRow {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  questionCount: number;
  attempts: number;
}
export interface MyExam {
  id: string;
  title: string;
  durationMinutes: number;
  state: string;
  score: number | null;
}
export interface MyInvoice {
  id: string;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  dueOn: string | null;
  status: string;
}
