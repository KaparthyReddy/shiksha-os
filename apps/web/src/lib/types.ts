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

export interface StudentRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  rollNo: string;
  guardianName: string | null;
  guardianPhone: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface StudentDetail extends StudentRow {
  batches: { batchId: string; batchName: string; courseName: string }[];
}
export interface FacultyRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  designation: string | null;
  subjects: string[] | null;
  isActive: boolean;
  createdAt: string;
}
export interface CourseRow {
  id: string;
  name: string;
  code: string;
  batchCount: number;
}
export interface BatchListRow extends BatchRow {
  courseId: string;
  startsOn: string | null;
  endsOn: string | null;
}
export interface BatchDetail {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  startsOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  enrolled: number;
  students: { studentId: string; name: string; rollNo: string; enrolledAt: string }[];
}
