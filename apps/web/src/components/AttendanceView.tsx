import { api } from "@/lib/api";
import { isDateStr, todayStr } from "@/lib/date";
import { qs } from "@/lib/qs";
import type { AttendanceRosterRow, AttendanceSummaryRow, BatchRow } from "@/lib/types";
import AttendanceRegister from "./AttendanceRegister";
import { Badge, Table, inputClass } from "./ui";

/** Shared by the admin and teacher attendance pages. */
export default async function AttendanceView({ batchId, date }: { batchId?: string; date?: string }) {
  const today = todayStr();
  const day = isDateStr(date) ? date : today;
  const batches = await api<BatchRow[]>("/batches");
  const selected = batches.find((b) => b.id === batchId);

  const [roster, summary] = selected
    ? await Promise.all([
        api<AttendanceRosterRow[]>(`/attendance${qs({ batchId: selected.id, date: day })}`),
        api<AttendanceSummaryRow[]>(`/attendance/summary${qs({ batchId: selected.id })}`),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Attendance</h1>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium">
          Batch
          <select name="batchId" defaultValue={selected?.id ?? ""} required className={`${inputClass} min-w-64`}>
            <option value="" disabled>
              Choose a batch
            </option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Date
          <input type="date" name="date" defaultValue={day} max={today} required className={inputClass} />
        </label>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Load register</button>
      </form>

      {!selected && <p className="text-sm text-slate-500">Choose a batch and a date to mark or review attendance.</p>}

      {selected && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {selected.name} · {day}
            </h2>
            <AttendanceRegister key={`${selected.id}-${day}`} batchId={selected.id} date={day} rows={roster} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Batch summary (all dates)</h2>
            <Table head={["Roll no.", "Name", "Present", "Late", "Absent", "Excused", "Attendance"]}>
              {summary.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-slate-500">
                    No students enrolled.
                  </td>
                </tr>
              )}
              {summary.map((s) => (
                <tr key={s.studentId}>
                  <td className="px-4 py-3">{s.rollNo}</td>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.present}</td>
                  <td className="px-4 py-3">{s.late}</td>
                  <td className="px-4 py-3">{s.absent}</td>
                  <td className="px-4 py-3">{s.excused}</td>
                  <td className="px-4 py-3">
                    {s.percentage === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <Badge tone={s.belowThreshold ? "red" : "green"}>{s.percentage}%</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            <p className="text-xs text-slate-500">Late counts as attended. Excused days are left out. Below 75% is flagged.</p>
          </section>
        </>
      )}
    </div>
  );
}
