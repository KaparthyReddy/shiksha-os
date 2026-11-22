import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { ADMIN_NAV, STUDENT_NAV, TEACHER_NAV } from "@/lib/nav";
import type { Me } from "@/lib/types";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const me = await api<Me>("/auth/me");
  const nav = me.role === "admin" ? ADMIN_NAV : me.role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
  const title = me.role === "admin" ? "Admin" : me.role === "teacher" ? "Teacher" : "Student";
  return (
    <Shell title={title} nav={nav}>
      {children}
    </Shell>
  );
}
