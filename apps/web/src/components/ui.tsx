import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">{title}</h2>}
      {children}
    </section>
  );
}

export function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {text}
      {children}
    </label>
  );
}

const tones = {
  green: "bg-emerald-100 text-emerald-800",
  slate: "bg-slate-100 text-slate-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const on = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100";
  const off = "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-300";
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>{total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={on}>
            Previous
          </Link>
        ) : (
          <span className={off}>Previous</span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={on}>
            Next
          </Link>
        ) : (
          <span className={off}>Next</span>
        )}
      </div>
    </div>
  );
}
