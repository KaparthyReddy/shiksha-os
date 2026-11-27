import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { Badge, Card, Label, Table, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import type { LiveClassDetail } from "@/lib/types";
import { cancelLiveClassAction, endLiveClassAction, liveAttendanceAction } from "../../live-actions";

const tone = { scheduled: "slate", live: "green", ended: "amber", cancelled: "red" } as const;
const dur = (s: number) => (s <= 0 ? "—" : `${Math.floor(s / 60)}m ${s % 60}s`);

export default async function LiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let cls: LiveClassDetail;
  try {
    cls = await api<LiveClassDetail>(`/live-classes/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const open = cls.status === "scheduled" || cls.status === "live";
  const joinedCount = cls.roster.filter((r) => r.firstJoinedAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/staff/live" className="text-sm text-slate-500 hover:underline">
            ← Live classes
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{cls.title}</h1>
          <p className="text-sm text-slate-500">
            {cls.batchName} · {fmtDateTime(cls.scheduledAt)} · {cls.durationMinutes} min
          </p>
        </div>
        <Badge tone={tone[cls.status]}>{cls.status}</Badge>
      </div>

      <Card title="Control">
        <div className="flex flex-wrap items-center gap-3">
          {open && (
            <Link href={`/live/${cls.id}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              {cls.status === "scheduled" ? "Start class" : "Rejoin class"}
            </Link>
          )}
          {cls.status === "live" && (
            <ActionForm action={endLiveClassAction} submitLabel="End class" variant="danger" inline confirm="End this class for everyone?">
              <input type="hidden" name="id" value={cls.id} />
            </ActionForm>
          )}
          {cls.status === "scheduled" && (
            <ActionForm action={cancelLiveClassAction} submitLabel="Cancel class" variant="plain" inline confirm="Cancel this class?">
              <input type="hidden" name="id" value={cls.id} />
            </ActionForm>
          )}
        </div>
        {cls.status === "scheduled" && (
          <p className="mt-3 text-xs text-slate-500">Students can join only after you start the class. Starting means joining the room.</p>
        )}
      </Card>

      {cls.status === "ended" && (
        <Card title="Mark attendance from this class">
          <p className="mb-3 text-sm text-slate-600">
            Students who stayed at least this long are marked present, and everyone else absent. Marks you made by hand are kept.
          </p>
          <ActionForm action={liveAttendanceAction} submitLabel="Mark attendance" inline>
            <input type="hidden" name="id" value={cls.id} />
            <label className="flex items-center gap-2 text-sm">
              Minimum minutes
              <input name="minMinutes" type="number" min={0} max={240} step="any" defaultValue={10} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </ActionForm>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Students ({joinedCount} of {cls.roster.length} joined)
        </h2>
        <Table head={["Roll no.", "Name", "Joined", "Time in class", "Joins"]}>
          {cls.roster.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-slate-500">
                No students are enrolled in this batch.
              </td>
            </tr>
          )}
          {cls.roster.map((r) => (
            <tr key={r.studentId}>
              <td className="px-4 py-3">{r.rollNo}</td>
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3">{r.firstJoinedAt ? <Badge tone="green">Yes</Badge> : <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3">{r.firstJoinedAt ? dur(r.totalSeconds ?? 0) : "—"}</td>
              <td className="px-4 py-3">{r.joinCount ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <p className="text-xs text-slate-500">
          Time in class comes from LiveKit&apos;s join and leave events. If it shows a dash for someone who joined, LiveKit&apos;s webhook
          isn&apos;t reaching the API (see the self-hosting notes).
        </p>
      </section>

      {cls.staffJoined.length > 0 && (
        <p className="text-sm text-slate-600">Teachers who joined: {cls.staffJoined.map((t) => t.name).join(", ")}</p>
      )}
    </div>
  );
}
