import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      title="Admin"
      nav={[
        { label: "Dashboard", href: "/admin" },
        { label: "Students", href: "/admin/students" },
        { label: "Faculty", href: "/admin/faculty" },
        { label: "Batches", href: "/admin/batches" },
        { label: "Exams" },
        { label: "Fees", href: "/admin/fees" },
        { label: "Attendance", href: "/admin/attendance" },
      ]}
    >
      {children}
    </Shell>
  );
}
