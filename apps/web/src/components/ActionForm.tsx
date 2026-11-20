"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { idle, type FormState } from "@/lib/form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Variant = "primary" | "danger" | "plain";

const button: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  plain: "border border-slate-300 hover:bg-slate-100",
};

/**
 * A form wired to a server action. It keeps what you typed when the server rejects it,
 * clears itself on success, and shows API validation errors and one-time secrets.
 */
export default function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
  variant = "primary",
  confirm,
  inline = false,
}: {
  action: Action;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: Variant;
  confirm?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = new FormData(e.currentTarget);
    setCopied(false);
    startTransition(() => {
      formAction(data);
    });
  }

  const submit = (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${button[variant]}`}
    >
      {pending ? "Working…" : submitLabel}
    </button>
  );

  const err = state.status === "error" ? state : null;

  if (inline) {
    return (
      <form ref={ref} onSubmit={onSubmit} className="inline-flex items-center gap-2">
        {children}
        {submit}
        {err && <span className="text-xs text-red-600">{err.message}</span>}
      </form>
    );
  }

  const lines = err?.fieldErrors ? Object.entries(err.fieldErrors).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`)) : [];

  return (
    <form ref={ref} onSubmit={onSubmit}>
      <div className={className}>{children}</div>
      <div className="mt-4">{submit}</div>
      {err && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
      {state.status === "success" && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <div>{state.message}</div>
          {state.secret && (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-3">
              <div className="text-xs text-slate-500">{state.secret.label}</div>
              <div className="mt-1 flex items-center gap-3">
                <code className="select-all font-mono text-base">{state.secret.value}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(state.secret!.value)
                      .then(() => setCopied(true))
                      .catch(() => undefined);
                  }}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
