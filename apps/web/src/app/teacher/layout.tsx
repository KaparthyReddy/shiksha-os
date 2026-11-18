import type { ReactNode } from "react";
import Shell from "@/components/Shell";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <Shell
      title="Teacher"
      nav={[
        { label: "My exams", href: "/teacher" },
        { label: "Question bank" },
        { label: "Attendance" },
        { label: "Live classes" },
      ]}
    >
      {children}
    </Shell>
  );
}
