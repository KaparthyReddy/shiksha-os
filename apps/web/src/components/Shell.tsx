import type { ReactNode } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Me, Tenant } from "@/lib/types";
import LogoutButton from "./LogoutButton";

export interface NavItem {
  label: string;
  href?: string;
}

export default async function Shell({
  title,
  nav,
  children,
}: {
  title: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const [me, tenant] = await Promise.all([api<Me>("/auth/me"), api<Tenant>("/tenant")]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <div className="px-2 text-lg font-semibold tracking-tight">ShikshaOS</div>
        <div className="mt-0.5 px-2 text-xs uppercase tracking-wide text-slate-400">{title}</div>
        <nav className="mt-6 space-y-1">
          {nav.map((n) =>
            n.href ? (
              <Link key={n.label} href={n.href} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100">
                {n.label}
              </Link>
            ) : (
              <div key={n.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400">
                {n.label}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase">soon</span>
              </div>
            ),
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="font-medium">{tenant.name}</div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/account" className="text-slate-600 hover:underline">{me.name}</Link>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
