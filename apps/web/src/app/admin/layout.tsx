import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      title="Admin"
      nav={[
        { label: "Dashboard", href: "/admin" },
        { label: "Students" },
        { label: "Faculty" },
        { label: "Batches" },
        { label: "Exams" },
        { label: "Fees" },
        { label: "Attendance" },
      ]}
    >
      {children}
    </Shell>
  );
}
