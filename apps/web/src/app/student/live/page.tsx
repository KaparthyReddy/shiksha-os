import Link from "next/link";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import type { MyLiveClass } from "@/lib/types";

const tone = { scheduled: "slate", live: "green", ended: "amber", cancelled: "red" } as const;

export default async function StudentLive() {
  const classes = await api<MyLiveClass[]>("/me/live-classes");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Live classes</h1>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {classes.length === 0 && <p className="p-4 text-sm text-slate-500">No classes scheduled for your batches yet.</p>}
        {classes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">{c.title}</div>
              <div className="text-xs text-slate-500">
                {c.batchName} · {fmtDateTime(c.scheduledAt)} · {c.durationMinutes} min
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {c.status === "ended" && <span className="text-xs text-slate-500">{c.attended ? "You attended" : "You didn't join"}</span>}
              <Badge tone={tone[c.status]}>{c.status === "live" ? "live now" : c.status}</Badge>
              {c.status === "live" && (
                <Link href={`/live/${c.id}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                  Join
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">You can join a class once your teacher has started it.</p>
    </div>
  );
}
