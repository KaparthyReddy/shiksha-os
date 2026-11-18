import { api } from "@/lib/api";
import type { ExamRow, Paged } from "@/lib/types";

const badge: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-emerald-100 text-emerald-800",
  closed: "bg-amber-100 text-amber-800",
};

export default async function TeacherHome() {
  const exams = await api<Paged<ExamRow>>("/exams?pageSize=50");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Exams</h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Questions</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {exams.items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-slate-500">No exams yet.</td></tr>
            )}
            {exams.items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium">{e.title}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge[e.status] ?? badge.draft}`}>{e.status}</span>
                </td>
                <td className="px-4 py-3">{e.questionCount}</td>
                <td className="px-4 py-3">{e.durationMinutes} min</td>
                <td className="px-4 py-3">{e.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
