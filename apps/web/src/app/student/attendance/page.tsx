import Stat from "@/components/Stat";
import { Badge, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { MyAttendance } from "@/lib/types";

const tone = { present: "green", late: "amber", absent: "red", excused: "slate" } as const;

export default async function StudentAttendance() {
  const data = await api<MyAttendance>("/me/attendance");
  const { summary, recent } = data;
  const low = summary.percentage !== null && summary.percentage < 75;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My attendance</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Attendance" value={summary.percentage === null ? "—" : `${summary.percentage}%`} />
        <Stat label="Present" value={String(summary.present)} />
        <Stat label="Late" value={String(summary.late)} />
        <Stat label="Absent" value={String(summary.absent)} />
        <Stat label="Excused" value={String(summary.excused)} />
      </section>

      {low && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your attendance is below 75%. Talk to your teacher if any of these records look wrong.
        </p>
      )}

      <Table head={["Date", "Batch", "Status"]}>
        {recent.length === 0 && (
          <tr>
            <td colSpan={3} className="px-4 py-6 text-slate-500">
              No attendance has been recorded yet.
            </td>
          </tr>
        )}
        {recent.map((r) => (
          <tr key={`${r.date}-${r.batchName}`}>
            <td className="px-4 py-3">{r.date}</td>
            <td className="px-4 py-3 text-slate-600">{r.batchName}</td>
            <td className="px-4 py-3">
              <Badge tone={tone[r.status]}>{r.status}</Badge>
            </td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-slate-500">Showing your latest 30 days. Late counts as attended. Excused days are left out.</p>
    </div>
  );
}
