import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { TEACHER_NAV } from "@/lib/nav";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <Shell title="Teacher" nav={TEACHER_NAV}>
      {children}
    </Shell>
  );
}
