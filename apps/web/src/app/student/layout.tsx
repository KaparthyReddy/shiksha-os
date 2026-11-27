import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { STUDENT_NAV } from "@/lib/nav";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <Shell title="Student" nav={STUDENT_NAV}>
      {children}
    </Shell>
  );
}
