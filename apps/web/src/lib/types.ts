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

export interface FeePlan {
  id: string;
  name: string;
  amountPaise: number;
  description: string | null;
}
export interface InvoiceListRow {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  feePlanId: string | null;
  amountPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  dueOn: string | null;
  status: string;
  overdue: boolean;
}
export interface InvoiceDetail {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  amountPaise: number;
  dueOn: string | null;
  status: string;
  paidPaise: number;
  outstandingPaise: number;
  payments: {
    id: string;
    amountPaise: number;
    method: string;
    reference: string | null;
    receiptNo: string;
    receivedAt: string;
  }[];
}
export interface MyInvoiceFull extends MyInvoice {
  payments: { receiptNo: string; amountPaise: number; method: string; receivedAt: string }[];
}
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export interface AttendanceRosterRow {
  studentId: string;
  name: string;
  rollNo: string;
  status: AttendanceStatus | null;
}
export interface AttendanceSummaryRow {
  studentId: string;
  name: string;
  rollNo: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  percentage: number | null;
  belowThreshold: boolean;
}
export interface MyAttendance {
  summary: { present: number; late: number; absent: number; excused: number; percentage: number | null };
  recent: { date: string; status: AttendanceStatus; batchName: string }[];
}

export interface QuestionRow {
  id: string;
  subject: string;
  topic: string | null;
  type: "single_choice" | "multi_choice" | "numeric";
  body: string;
  options: { id: string; text: string }[] | null;
  correct: string[];
  marks: number;
  negativeMarks: number;
  createdAt: string;
}
export interface ExamListRow {
  id: string;
  title: string;
  status: string;
  batchId: string | null;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  questionCount: number;
  attempts: number;
}
export interface ExamDetail {
  id: string;
  title: string;
  status: string;
  batchId: string | null;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  shuffle: boolean;
  resultsReleased: boolean;
  questions: (Omit<QuestionRow, "createdAt"> & { position: number })[];
}
export interface ExamResults {
  exam: { id: string; title: string; status: string };
  maxScore: number;
  attempted: number;
  results: {
    sessionId: string;
    studentId: string;
    name: string;
    rollNo: string;
    status: string;
    score: number | null;
    startedAt: string;
    submittedAt: string | null;
    lateAnswers: number;
    rank: number | null;
  }[];
}

export interface BatchTeacher {
  facultyId: string;
  name: string;
  email: string;
  designation: string | null;
}

export type LiveStatus = "scheduled" | "live" | "ended" | "cancelled";
export interface LiveClassRow {
  id: string;
  title: string;
  batchId: string;
  batchName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: LiveStatus;
  startedAt: string | null;
  endedAt: string | null;
  joined: number;
}
export interface LiveClassDetail {
  id: string;
  title: string;
  batchId: string;
  batchName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: LiveStatus;
  startedAt: string | null;
  endedAt: string | null;
  roster: {
    studentId: string;
    name: string;
    rollNo: string;
    firstJoinedAt: string | null;
    totalSeconds: number | null;
    joinCount: number | null;
  }[];
  staffJoined: { name: string; firstJoinedAt: string; totalSeconds: number }[];
}
export interface MyLiveClass {
  id: string;
  title: string;
  batchName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: LiveStatus;
  attended: boolean;
}
