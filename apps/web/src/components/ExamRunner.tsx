"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnswerBuffer, ClockSync, isAnswered, type AnswerValue, type BufferSnapshot } from "@shiksha/exam-engine";
import type {
  ApiErrorBody,
  ExamPayload,
  PayloadQuestion,
  SubmitResult,
  SyncResponse,
  TimeResponse,
} from "@/lib/exam-types";

type Phase = "loading" | "error" | "running" | "submitting" | "done";
type SyncState = "saved" | "saving" | "offline" | "error";
type Answers = Record<string, { response: AnswerValue; marked: boolean }>;
type CachedExam = { payload: ExamPayload; offset: number };

class NetError extends Error {}

const bufKey = (sid: string) => `shiksha:buf:${sid}`;
const cacheKey = (examId: string) => `shiksha:exam:${examId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lsGet<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage full: we just lose offline persistence */
  }
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`/api/proxy/${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new NetError("network");
  }
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  return { status: res.status, data };
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function ExamRunner({ examId }: { examId: string }) {
  const [clock] = useState(() => new ClockSync());
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [payload, setPayload] = useState<ExamPayload | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [sync, setSync] = useState<SyncState>("saved");
  const [pending, setPending] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitNote, setSubmitNote] = useState<string | null>(null);

  const bufferRef = useRef<AnswerBuffer | null>(null);
  const sessionRef = useRef<string | null>(null);
  const payloadRef = useRef<ExamPayload | null>(null);
  const deadlineRef = useRef(0);
  const flushingRef = useRef(false);
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);
  const wantSubmitRef = useRef(false);
  const autoRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistBuffer = useCallback(() => {
    if (sessionRef.current && bufferRef.current) lsSet(bufKey(sessionRef.current), bufferRef.current.snapshot());
  }, []);

  const saveCache = useCallback(() => {
    if (payloadRef.current) lsSet(cacheKey(examId), { payload: payloadRef.current, offset: clock.now(0) });
  }, [examId, clock]);

  const init = useCallback(
    (p: ExamPayload) => {
      const sid = p.session.id;
      sessionRef.current = sid;
      payloadRef.current = p;
      deadlineRef.current = Date.parse(p.session.deadlineAt);

      const serverSeq: Record<string, number> = {};
      const map: Answers = {};
      for (const a of p.answers) {
        serverSeq[a.questionId] = a.clientSeq;
        map[a.questionId] = { response: a.response, marked: a.markedForReview };
      }
      // Seed sequence numbers from both the server and this device so new answers never look stale.
      const snap = lsGet<BufferSnapshot>(bufKey(sid));
      const seq: Record<string, number> = { ...(snap?.seq ?? {}) };
      for (const [qid, s] of Object.entries(serverSeq)) seq[qid] = Math.max(seq[qid] ?? 0, s);
      const pendingItems = (snap?.pending ?? []).filter((x) => x.clientSeq > (serverSeq[x.questionId] ?? 0));
      for (const x of pendingItems) map[x.questionId] = { response: x.response, marked: x.markedForReview };

      bufferRef.current = new AnswerBuffer(() => clock.now(), { seq, pending: pendingItems });
      setPayload(p);
      setAnswers(map);
      setPending(pendingItems.length);
      setRemainingMs(Math.max(0, deadlineRef.current - clock.now()));
      setPhase("running");
    },
    [clock],
  );

  // ---------- Load / resume ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sent = Date.now();
      try {
        const r = await call<ExamPayload>("POST", `exams/${examId}/start`);
        if (cancelled) return;
        if (r.status === 401) {
          setMessage("Your session expired. Sign in again to continue.");
          setPhase("error");
          return;
        }
        if (r.status >= 400) {
          // 5xx while we hold a cached copy: keep going from the cache.
          const cached = r.status >= 500 ? lsGet<CachedExam>(cacheKey(examId)) : null;
          if (cached) {
            clock.update(Date.now() + cached.offset, Date.now(), Date.now());
            init(cached.payload);
            setSync("offline");
            return;
          }
          setMessage(r.data.error?.message ?? "Could not start the exam.");
          setPhase("error");
          return;
        }
        clock.update(Date.parse(r.data.session.serverNow), sent, Date.now());
        payloadRef.current = r.data;
        saveCache();
        init(r.data);
      } catch {
        if (cancelled) return;
        const cached = lsGet<CachedExam>(cacheKey(examId));
        if (cached) {
          clock.update(Date.now() + cached.offset, Date.now(), Date.now());
          init(cached.payload);
          setSync("offline");
        } else {
          setMessage("You're offline and this exam isn't on this device yet. Connect to the internet to begin.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, clock, init, saveCache]);

  // ---------- Sync ----------
  const flush = useCallback(async () => {
    const buf = bufferRef.current;
    const sid = sessionRef.current;
    if (!buf || !sid || flushingRef.current || submittedRef.current) return;
    const items = buf.pending();
    if (items.length === 0) {
      setSync("saved");
      return;
    }
    flushingRef.current = true;
    setSync("saving");
    try {
      for (let i = 0; i < items.length; i += 200) {
        const r = await call<SyncResponse>("POST", `exam-sessions/${sid}/answers`, {
          answers: items.slice(i, i + 200),
        });
        if (r.status === 401) {
          setAuthLost(true);
          setSync("error");
          return;
        }
        if (r.status >= 400) {
          setSync("error");
          return;
        }
        setAuthLost(false);
        buf.ack(r.data.ack);
        persistBuffer();
        if (r.data.status !== "in_progress") wantSubmitRef.current = true;
      }
      setSync(buf.pending().length > 0 ? "saving" : "saved");
    } catch {
      setSync("offline");
    } finally {
      flushingRef.current = false;
      setPending(buf.pending().length);
    }
  }, [persistBuffer]);

  const scheduleFlush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  // ---------- Submit ----------
  const finish = useCallback((r: SubmitResult) => {
    submittedRef.current = true;
    wantSubmitRef.current = false;
    if (sessionRef.current) lsDel(bufKey(sessionRef.current));
    lsDel(cacheKey(examId));
    setResult(r);
    setPhase("done");
  }, [examId]);

  const submit = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || submittedRef.current || submittingRef.current) return;
    submittingRef.current = true;
    setConfirming(false);
    setSubmitNote(null);
    setPhase("submitting");
    try {
      for (let i = 0; i < 4; i++) {
        await flush();
        if ((bufferRef.current?.pending().length ?? 0) === 0) break;
        await sleep(1200);
      }
      const r = await call<SubmitResult>("POST", `exam-sessions/${sid}/submit`);
      if (r.status === 401) {
        setAuthLost(true);
        wantSubmitRef.current = true;
        setPhase("running");
        return;
      }
      if (r.status >= 400) {
        wantSubmitRef.current = true;
        setSubmitNote(r.data.error?.message ?? "Submit didn't go through. Retrying automatically.");
        setPhase("running");
        return;
      }
      finish(r.data);
    } catch {
      wantSubmitRef.current = true;
      setSubmitNote("You're offline. Your answers are saved on this device and will be submitted automatically once you're back online.");
      setPhase("running");
    } finally {
      submittingRef.current = false;
    }
  }, [flush, finish]);

  const heartbeat = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || submittedRef.current) return;
    const sent = Date.now();
    try {
      const r = await call<TimeResponse>("GET", `exam-sessions/${sid}/time`);
      if (r.status !== 200) return;
      clock.update(Date.parse(r.data.serverNow), sent, Date.now());
      deadlineRef.current = Date.parse(r.data.deadlineAt);
      saveCache();
      if (r.data.status !== "in_progress") {
        wantSubmitRef.current = true;
        void submit();
      }
    } catch {
      /* offline: keep the last clock estimate */
    }
  }, [clock, saveCache, submit]);

  // ---------- Timers and connectivity ----------
  useEffect(() => {
    if (phase !== "running") return;
    const tick = setInterval(() => {
      const rem = Math.max(0, deadlineRef.current - clock.now());
      setRemainingMs(rem);
      if (rem === 0 && !autoRef.current) {
        autoRef.current = true;
        wantSubmitRef.current = true;
        void submit();
      }
    }, 250);
    const retry = setInterval(() => void (wantSubmitRef.current ? submit() : flush()), 6000);
    const beat = setInterval(() => void heartbeat(), 30_000);
    const onOnline = () => {
      void heartbeat();
      void (wantSubmitRef.current ? submit() : flush());
    };
    const onOffline = () => setSync("offline");
    const onVisible = () => {
      if (document.visibilityState === "visible") onOnline();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(retry);
      clearInterval(beat);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, clock, submit, flush, heartbeat]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if ((bufferRef.current?.pending().length ?? 0) > 0 && !submittedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => {
      window.removeEventListener("beforeunload", h);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const q = payload?.questions[index];
    if (q) setVisited((v) => (v[q.id] ? v : { ...v, [q.id]: true }));
  }, [index, payload]);

  // ---------- Answering ----------
  function setAnswer(q: PayloadQuestion, response: AnswerValue, marked?: boolean) {
    const m = marked ?? answers[q.id]?.marked ?? false;
    bufferRef.current?.record(q.id, response, m);
    persistBuffer();
    setAnswers((a) => ({ ...a, [q.id]: { response, marked: m } }));
    setPending(bufferRef.current?.pending().length ?? 0);
    setSync((s) => (s === "offline" ? s : "saving"));
    scheduleFlush();
  }

  function choose(q: PayloadQuestion, optionId: string) {
    if (q.type === "multi_choice") {
      const cur = answers[q.id]?.response;
      const list = Array.isArray(cur) ? cur : [];
      const next = list.includes(optionId) ? list.filter((x) => x !== optionId) : [...list, optionId];
      setAnswer(q, next.length > 0 ? next : null);
    } else {
      setAnswer(q, optionId);
    }
  }

  // ---------- Render ----------
  if (phase === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading your exam…</div>;
  }

  if (phase === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-700">{message}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/student" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              Back to dashboard
            </Link>
            <Link href="/login" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "done" && result) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">{result.status === "expired" ? "Time's up" : "Exam submitted"}</h1>
          <p className="mt-1 text-sm text-slate-500">{payload?.session.title}</p>
          <div className="mt-6 text-5xl font-semibold">
            {result.total}
            <span className="text-xl font-normal text-slate-400"> / {result.maxScore}</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-emerald-50 p-3"><div className="text-lg font-semibold text-emerald-700">{result.correct}</div>correct</div>
            <div className="rounded-lg bg-red-50 p-3"><div className="text-lg font-semibold text-red-700">{result.wrong}</div>wrong</div>
            <div className="rounded-lg bg-slate-100 p-3"><div className="text-lg font-semibold">{result.unanswered}</div>skipped</div>
          </div>
          <Link href="/student" className="mt-8 inline-block rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!payload) return null;
  const questions = payload.questions;
  const q = questions[index]!;
  const cur = answers[q.id];
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id]?.response)).length;
  const markedCount = questions.filter((x) => answers[x.id]?.marked).length;
  const low = remainingMs !== null && remainingMs < 5 * 60_000;

  const paletteClass = (x: PayloadQuestion, i: number) => {
    const a = answers[x.id];
    let c = "border-slate-300 bg-white text-slate-700";
    if (a?.marked) c = "border-purple-500 bg-purple-500 text-white";
    else if (isAnswered(a?.response)) c = "border-emerald-500 bg-emerald-500 text-white";
    else if (visited[x.id]) c = "border-red-300 bg-red-50 text-red-700";
    return `${c} ${i === index ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`;
  };

  const syncBadge = {
    saved: ["bg-emerald-100 text-emerald-800", "All answers saved"],
    saving: ["bg-sky-100 text-sky-800", "Saving…"],
    offline: ["bg-amber-100 text-amber-900", `Offline · ${pending} answer${pending === 1 ? "" : "s"} kept on this device`],
    error: ["bg-red-100 text-red-800", "Couldn't save · retrying"],
  }[sync];

  const input = "h-5 w-5 shrink-0 accent-indigo-600";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{payload.session.title}</div>
          <div className="text-xs text-slate-500">
            Question {index + 1} of {questions.length} · {q.subject}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`hidden rounded-full px-3 py-1 text-xs sm:inline ${syncBadge[0]}`}>{syncBadge[1]}</span>
          <div className={`rounded-lg px-3 py-1.5 font-mono text-lg font-semibold ${low ? "bg-red-100 text-red-700" : "bg-slate-100"}`}>
            {fmt(remainingMs ?? 0)}
          </div>
        </div>
      </header>

      {authLost && (
        <div className="bg-amber-100 px-4 py-2 text-sm text-amber-900">
          Your sign-in expired. Your answers are safe on this device.{" "}
          <a href="/login" target="_blank" rel="noreferrer" className="font-medium underline">Sign in again in a new tab</a>, then come back here.
        </div>
      )}
      {submitNote && <div className="bg-amber-100 px-4 py-2 text-sm text-amber-900">{submitNote}</div>}
      <div className={`px-4 py-1.5 text-center text-xs sm:hidden ${syncBadge[0]}`}>{syncBadge[1]}</div>

      <main className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[1fr_280px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Question {index + 1}</span>
            <span>+{q.marks} / −{q.negativeMarks}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed">{q.body}</p>

          <div className="mt-6 space-y-2">
            {q.type === "numeric" ? (
              <input
                inputMode="decimal"
                value={typeof cur?.response === "string" || typeof cur?.response === "number" ? String(cur.response) : ""}
                onChange={(e) => setAnswer(q, e.target.value.trim() === "" ? null : e.target.value)}
                placeholder="Type your numeric answer"
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            ) : (
              q.options?.map((o, i) => {
                const picked = q.type === "multi_choice" ? Array.isArray(cur?.response) && cur.response.includes(o.id) : cur?.response === o.id;
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${picked ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <input
                      type={q.type === "multi_choice" ? "checkbox" : "radio"}
                      name={`q-${q.id}`}
                      checked={picked}
                      onChange={() => choose(q, o.id)}
                      className={input}
                    />
                    <span><span className="mr-2 font-medium text-slate-500">{String.fromCharCode(65 + i)}.</span>{o.text}</span>
                  </label>
                );
              })
            )}
            {q.type === "multi_choice" && <p className="text-xs text-slate-500">Select all that apply.</p>}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-40">Previous</button>
            <button onClick={() => setAnswer(q, null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Clear</button>
            <button onClick={() => setAnswer(q, cur?.response ?? null, !cur?.marked)}
              className={`rounded-lg border px-4 py-2 text-sm ${cur?.marked ? "border-purple-500 bg-purple-100 text-purple-800" : "border-slate-300 hover:bg-slate-100"}`}>
              {cur?.marked ? "Unmark review" : "Mark for review"}
            </button>
            <button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={index === questions.length - 1}
              className="ml-auto rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">Save &amp; Next</button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((x, i) => (
                <button key={x.id} onClick={() => setIndex(i)}
                  className={`h-9 rounded-lg border text-sm font-medium ${paletteClass(x, i)}`}>{i + 1}</button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-emerald-500" />Answered</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-purple-500" />Marked</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded border border-red-300 bg-red-50" />Not answered</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded border border-slate-300 bg-white" />Not visited</span>
            </div>
          </div>
          <button onClick={() => setConfirming(true)}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">Submit exam</button>
        </aside>
      </main>

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Submit your exam?</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>Answered: <b>{answeredCount}</b> of {questions.length}</li>
              <li>Not answered: <b>{questions.length - answeredCount}</b></li>
              <li>Marked for review: <b>{markedCount}</b></li>
            </ul>
            {pending > 0 && <p className="mt-3 text-xs text-amber-700">{pending} answer(s) still syncing. We'll send them first.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Keep working</button>
              <button onClick={() => void submit()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Submit</button>
            </div>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-white/70 text-slate-700">Submitting your answers…</div>
      )}
    </div>
  );
}
