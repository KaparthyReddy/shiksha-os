import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { ADMIN_NAV } from "@/lib/nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Shell title="Admin" nav={ADMIN_NAV}>
      {children}
    </Shell>
  );
}
