"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { saveAttendanceAction } from "@/app/attendance-actions";
import { idle } from "@/lib/form";
import type { AttendanceRosterRow } from "@/lib/types";

type Status = "present" | "absent" | "late" | "excused";

const OPTIONS: { value: Status; label: string; on: string }[] = [
  { value: "present", label: "Present", on: "border-emerald-500 bg-emerald-500 text-white" },
  { value: "absent", label: "Absent", on: "border-red-500 bg-red-500 text-white" },
  { value: "late", label: "Late", on: "border-amber-500 bg-amber-500 text-white" },
  { value: "excused", label: "Excused", on: "border-sky-500 bg-sky-500 text-white" },
];

export default function AttendanceRegister({
  batchId,
  date,
  rows,
}: {
  batchId: string;
  date: string;
  rows: AttendanceRosterRow[];
}) {
  const [state, formAction, pending] = useActionState(saveAttendanceAction, idle);
  const [, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<string, Status | null>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, r.status])),
  );

  const set = (id: string, v: Status | null) => setVals((s) => ({ ...s, [id]: v }));
  const marked = rows.filter((r) => vals[r.studentId]).length;
  const count = (s: Status) => rows.filter((r) => vals[r.studentId] === s).length;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No students are enrolled in this batch.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setVals(Object.fromEntries(rows.map((r) => [r.studentId, "present" as Status])))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
        >
          Mark all present
        </button>
        <button
          type="button"
          onClick={() => setVals(Object.fromEntries(rows.map((r) => [r.studentId, null])))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
        >
          Clear all
        </button>
        <span className="text-slate-500">
          {count("present")} present · {count("absent")} absent · {count("late")} late · {count("excused")} excused ·{" "}
          {rows.length - marked} not marked
        </span>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <div key={r.studentId} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-xs text-slate-500">{r.rollNo}</div>
            </div>
            <div className="flex gap-1.5">
              {OPTIONS.map((o) => {
                const picked = vals[r.studentId] === o.value;
                return (
                  <label
                    key={o.value}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                      picked ? o.on : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`s_${r.studentId}`}
                      value={o.value}
                      checked={picked}
                      onChange={() => set(r.studentId, o.value)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save attendance"}
        </button>
        {state.status === "success" && <span className="text-sm text-emerald-700">{state.message}</span>}
        {state.status === "error" && <span className="text-sm text-red-700">{state.message}</span>}
      </div>
    </form>
  );
}
