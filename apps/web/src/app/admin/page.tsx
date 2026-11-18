import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import type { BatchRow, FeesSummary, Paged } from "@/lib/types";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default async function AdminHome() {
  const [students, faculty, batches, fees] = await Promise.all([
    api<Paged<unknown>>("/students?pageSize=1"),
    api<Paged<unknown>>("/faculty?pageSize=1"),
    api<BatchRow[]>("/batches"),
    api<FeesSummary>("/fees/summary"),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(students.total)} />
        <Stat label="Faculty" value={String(faculty.total)} />
        <Stat label="Batches" value={String(batches.length)} />
        <Stat label="Overdue invoices" value={String(fees.overdueCount)} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Invoiced" value={inr(fees.invoicedPaise)} />
        <Stat label="Collected" value={inr(fees.collectedPaise)} />
        <Stat label="Pending" value={inr(fees.pendingPaise)} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Batch occupancy</h2>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {batches.length === 0 && <p className="p-4 text-sm text-slate-500">No batches yet.</p>}
          {batches.map((b) => {
            const pct = b.capacity ? Math.min(100, Math.round((b.enrolled / b.capacity) * 100)) : null;
            return (
              <div key={b.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="text-xs text-slate-500">{b.courseName}</div>
                </div>
                <div className="w-48 shrink-0 text-right text-sm">
                  {b.enrolled}
                  {b.capacity ? ` / ${b.capacity}` : ""} students
                  {pct !== null && (
                    <div className="mt-1 h-1.5 rounded bg-slate-100">
                      <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
