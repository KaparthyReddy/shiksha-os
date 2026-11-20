"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { inputClass } from "@/components/ui";
import { idle, type FormState } from "@/lib/form";
import type { QuestionRow } from "@/lib/types";

type QType = QuestionRow["type"];
type Opt = { key: number; text: string };

const LETTERS = "abcdefgh";
const MAX_OPTIONS = 8;
const blank = (): Opt[] => [0, 1, 2, 3].map((key) => ({ key, text: "" }));

export default function QuestionForm({
  action,
  initial,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial?: QuestionRow;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();

  const initOptions = initial?.options ?? [];
  const initCorrect = initial?.correct ?? [];
  const startOpts: Opt[] = initOptions.length > 0 ? initOptions.map((o, i) => ({ key: i, text: o.text })) : blank();

  const [type, setType] = useState<QType>(initial?.type ?? "single_choice");
  const [body, setBody] = useState(initial?.body ?? "");
  const [options, setOptions] = useState<Opt[]>(startOpts);
  const [correct, setCorrect] = useState<number[]>(() =>
    initOptions.flatMap((o, i) => (initCorrect.includes(o.id) ? [i] : [])),
  );
  const [numeric, setNumeric] = useState(initial?.type === "numeric" ? (initCorrect[0] ?? "") : "");
  const nextKey = useRef(startOpts.length);

  // After adding a question, clear the content but keep subject, topic and marks for the next one.
  useEffect(() => {
    if (state.status === "success" && resetOnSuccess) {
      setBody("");
      setOptions(blank());
      nextKey.current = 4;
      setCorrect([]);
      setNumeric("");
    }
  }, [state, resetOnSuccess]);

  function changeType(t: QType) {
    setType(t);
    if (t === "single_choice") setCorrect((c) => c.slice(0, 1));
  }
  function toggleCorrect(key: number) {
    setCorrect((c) =>
      type === "multi_choice" ? (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]) : [key],
    );
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((o) => [...o, { key: nextKey.current++, text: "" }]);
  }
  function removeOption(key: number) {
    if (options.length <= 2) return;
    setOptions((o) => o.filter((x) => x.key !== key));
    setCorrect((c) => c.filter((k) => k !== key));
  }
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
    <form onSubmit={onSubmit} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Subject
          <input name="subject" required defaultValue={initial?.subject ?? ""} placeholder="Physics" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Topic (optional)
          <input name="topic" defaultValue={initial?.topic ?? ""} placeholder="Mechanics" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Question type
          <select name="type" value={type} onChange={(e) => changeType(e.target.value as QType)} className={inputClass}>
            <option value="single_choice">Single correct answer</option>
            <option value="multi_choice">Multiple correct answers</option>
            <option value="numeric">Numeric answer</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Marks
            <input name="marks" type="number" step="any" min="0" defaultValue={initial?.marks ?? 4} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Negative marks
            <input name="negativeMarks" type="number" step="any" min="0" defaultValue={initial?.negativeMarks ?? 1} className={inputClass} />
          </label>
        </div>
      </div>

      <label className="block text-sm font-medium">
        Question
        <textarea name="body" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={inputClass} />
      </label>

      {type === "numeric" ? (
        <label className="block text-sm font-medium">
          Correct answer
          <input
            name="numeric"
            inputMode="decimal"
            value={numeric}
            onChange={(e) => setNumeric(e.target.value)}
            placeholder="9.8"
            className={`${inputClass} max-w-xs`}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Students&apos; answers match within a tiny tolerance.</span>
        </label>
      ) : (
        <div>
          <div className="mb-2 text-sm font-medium">
            Options <span className="font-normal text-slate-500">
              ({type === "multi_choice" ? "tick every correct option" : "select the correct option"})
            </span>
          </div>
          <div className="space-y-2">
            {options.map((o, i) => {
              const letter = LETTERS[i]!;
              return (
                <div key={o.key} className="flex items-center gap-2">
                  <input
                    type={type === "multi_choice" ? "checkbox" : "radio"}
                    name="correct"
                    value={letter}
                    checked={correct.includes(o.key)}
                    onChange={() => toggleCorrect(o.key)}
                    aria-label={`Option ${letter.toUpperCase()} is correct`}
                    className="h-5 w-5 shrink-0 accent-indigo-600"
                  />
                  <span className="w-5 text-sm font-medium text-slate-500">{letter.toUpperCase()}.</span>
                  <input
                    name={`opt_${letter}`}
                    value={o.text}
                    onChange={(e) => setOptions((opts) => opts.map((x) => (x.key === o.key ? { ...x, text: e.target.value } : x)))}
                    placeholder={`Option ${letter.toUpperCase()}`}
                    className={`${inputClass} !mt-0`}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(o.key)}
                    disabled={options.length <= 2}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          {options.length < MAX_OPTIONS && (
            <button type="button" onClick={addOption} className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
              Add option
            </button>
          )}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
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
      {state.status === "success" && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</div>}
    </form>
  );
}
