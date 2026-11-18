import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      title="Student"
      nav={[
        { label: "Home", href: "/student" },
        { label: "Exam runner" },
        { label: "Attendance" },
        { label: "Fees" },
      ]}
    >
      {children}
    </Shell>
  );
}
