import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      title="Student"
      nav={[
        { label: "Home", href: "/student" },
        { label: "Attendance", href: "/student/attendance" },
        { label: "Fees", href: "/student/fees" },
      ]}
    >
      {children}
    </Shell>
  );
}
