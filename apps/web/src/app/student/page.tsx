import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import type { MyExam, MyInvoice } from "@/lib/types";

const badge: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  upcoming: "bg-slate-100 text-slate-700",
  submitted: "bg-sky-100 text-sky-800",
  expired: "bg-amber-100 text-amber-800",
  missed: "bg-red-100 text-red-800",
};

export default async function StudentHome() {
  const [exams, invoices] = await Promise.all([api<MyExam[]>("/me/exams"), api<MyInvoice[]>("/me/invoices")]);
  const due = invoices.filter((i) => i.outstandingPaise > 0 && i.status !== "void");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">My exams</h2>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {exams.length === 0 && <p className="p-4 text-sm text-slate-500">No exams right now.</p>}
          {exams.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-slate-500">{e.durationMinutes} minutes</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {e.score !== null && <span className="font-medium">{e.score} marks</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${badge[e.state] ?? badge.upcoming}`}>
                  {e.state.replace("_", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Fees due</h2>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {due.length === 0 && <p className="p-4 text-sm text-slate-500">Nothing due. 🎉</p>}
          {due.map((i) => (
            <div key={i.id} className="flex items-center justify-between p-4 text-sm">
              <span>{i.dueOn ? `Due ${i.dueOn}` : "No due date"}</span>
              <span className="font-medium">{inr(i.outstandingPaise)} outstanding</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
