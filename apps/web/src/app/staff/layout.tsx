import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { ADMIN_NAV, TEACHER_NAV } from "@/lib/nav";
import type { Me } from "@/lib/types";

// Admins and teachers share these pages, so the sidebar depends on who is looking.
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const me = await api<Me>("/auth/me");
  const admin = me.role === "admin";
  return (
    <Shell title={admin ? "Admin" : "Teacher"} nav={admin ? ADMIN_NAV : TEACHER_NAV}>
      {children}
    </Shell>
  );
}
