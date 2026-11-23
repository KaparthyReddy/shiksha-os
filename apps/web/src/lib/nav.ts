import type { NavItem } from "@/components/Shell";

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Students", href: "/admin/students" },
  { label: "Faculty", href: "/admin/faculty" },
  { label: "Batches", href: "/admin/batches" },
  { label: "Import", href: "/admin/import" },
  { label: "Questions", href: "/staff/questions" },
  { label: "Exams", href: "/staff/exams" },
  { label: "Fees", href: "/admin/fees" },
  { label: "Attendance", href: "/admin/attendance" },
];

export const TEACHER_NAV: NavItem[] = [
  { label: "Home", href: "/teacher" },
  { label: "Questions", href: "/staff/questions" },
  { label: "Exams", href: "/staff/exams" },
  { label: "Attendance", href: "/teacher/attendance" },
  { label: "Live classes" },
];

export const STUDENT_NAV: NavItem[] = [
  { label: "Home", href: "/student" },
  { label: "Attendance", href: "/student/attendance" },
  { label: "Fees", href: "/student/fees" },
];
