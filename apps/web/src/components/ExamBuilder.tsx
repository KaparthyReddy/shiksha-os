"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Card, inputClass } from "@/components/ui";
import { idle, type FormState } from "@/lib/form";
import type { QuestionRow } from "@/lib/types";

type Picked = Pick<QuestionRow, "id" | "subject" | "topic" | "type" | "body" | "marks" | "negativeMarks">;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const noEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.preventDefault();
};
const TYPE: Record<string, string> = { single_choice: "Single", multi_choice: "Multiple", numeric: "Numeric" };

export default function ExamBuilder({
  batches,
  timezone,
  action,
}: {
  batches: { id: string; name: string }[];
  timezone: string;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();
  const [picked, setPicked] = useState<Picked[]>([]);

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Picked[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setLoadError(null);
        try {
          const params = new URLSearchParams({ page: String(page) });
          if (q.trim()) params.set("q", q.trim());
          if (subject.trim()) params.set("subject", subject.trim());
          const res = await fetch(`/api/staff/questions?${params}`, { signal: ctl.signal, cache: "no-store" });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            setLoadError(data?.error?.message ?? "Couldn't load questions.");
            return;
          }
          setTotal(data.total);
          setResults((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
        } catch (e) {
          if ((e as Error).name !== "AbortError") setLoadError("Couldn't load questions.");
        } finally {
          if (!ctl.signal.aborted) setLoading(false);
        }
      },
      page === 1 ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, subject, page]);

  const add = (item: Picked) => setPicked((p) => (p.some((x) => x.id === item.id) ? p : [...p, item]));
  const remove = (id: string) => setPicked((p) => p.filter((x) => x.id !== id));
  const move = (i: number, d: -1 | 1) =>
    setPicked((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const totalMarks = picked.reduce((s, x) => s + x.marks, 0);
  const pickedIds = new Set(picked.map((x) => x.id));
  const hasMore = results.length < total;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  const err = state.status === "error" ? state : null;
  const lines = err?.fieldErrors ? Object.entries(err.fieldErrors).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`)) : [];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">
            Title
            <input name="title" required placeholder="Physics Mock CBT #2" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Audience
            <select name="batchId" defaultValue="" className={inputClass}>
              <option value="">All students in the institute</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Duration (minutes)
            <input name="durationMinutes" type="number" min={1} max={600} defaultValue={60} required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Opens at (optional)
            <input name="startsAt" type="datetime-local" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Closes at (optional)
            <input name="endsAt" type="datetime-local" className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="shuffle" defaultChecked className="h-4 w-4 accent-indigo-600" />
            Shuffle question and option order for each student
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Times are in {timezone}. Each student&apos;s clock starts when they begin, and never runs past the closing time.
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Exam questions (${picked.length}) · ${totalMarks} marks`}>
          {picked.length === 0 && <p className="text-sm text-slate-500">Nothing yet. Add questions from the bank on the right.</p>}
          <ol className="space-y-2">
            {picked.map((x, i) => (
              <li key={x.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <input type="hidden" name="questionId" value={x.id} />
                <span className="w-6 shrink-0 pt-0.5 text-slate-500">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div>{clip(x.body, 110)}</div>
                  <div className="text-xs text-slate-500">
                    {x.subject} · {TYPE[x.type]} · +{x.marks}/−{x.negativeMarks}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label="Move down" className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40">
                    ↓
                  </button>
                  <button type="button" onClick={() => remove(x.id)} aria-label="Remove" className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Question bank">
          <div className="mb-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              onKeyDown={noEnter}
              placeholder="Search question text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setPage(1);
              }}
              onKeyDown={noEnter}
              placeholder="Subject"
              className="w-36 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {loadError && <p className="mb-2 text-sm text-red-600">{loadError}</p>}
          <ul className="space-y-2">
            {results.map((x) => (
              <li key={x.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div>{clip(x.body, 110)}</div>
                  <div className="text-xs text-slate-500">
                    {x.subject}
                    {x.topic ? ` · ${x.topic}` : ""} · {TYPE[x.type]} · +{x.marks}/−{x.negativeMarks}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => add(x)}
                  disabled={pickedIds.has(x.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-40"
                >
                  {pickedIds.has(x.id) ? "Added" : "Add"}
                </button>
              </li>
            ))}
          </ul>
          {!loading && results.length === 0 && !loadError && <p className="text-sm text-slate-500">No questions match.</p>}
          {loading && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {hasMore && !loading && (
            <button type="button" onClick={() => setPage((p) => p + 1)} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              Load more ({results.length} of {total})
            </button>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || picked.length === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create exam (as draft)"}
        </button>
        <span className="text-xs text-slate-500">You publish it from the next screen, once you&apos;ve checked it.</span>
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <div>{err.message}</div>
          {lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
