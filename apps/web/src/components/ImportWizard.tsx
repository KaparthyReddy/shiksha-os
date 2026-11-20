"use client";

import { useState, type ChangeEvent } from "react";
import { previewImportAction, runImportAction } from "@/app/admin/import/actions";
import { Badge, Card, inputClass } from "@/components/ui";
import { csvDataUrl, csvLine } from "@/lib/csv-out";
import type { ImportKind, ImportResult, PreviewResult } from "@/lib/import-types";

const MAX_BYTES = 500_000;

export default function ImportWizard({
  kind,
  batches,
}: {
  kind: ImportKind;
  batches: { id: string; name: string }[];
}) {
  const students = kind === "students";
  const identLabel = students ? "Roll no." : "Designation";

  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [batchId, setBatchId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  async function runPreview(text: string, batch: string) {
    setBusy("preview");
    setError(null);
    setPreview(null);
    const r = await previewImportAction(kind, text, batch || null);
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setPreview(r.data);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("That file is over 500 KB. Split it into files of 500 rows or fewer.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await runPreview(text, batchId);
  }

  async function onPaste() {
    setCsv(pasted);
    setFileName(null);
    await runPreview(pasted, batchId);
  }

  function onBatch(value: string) {
    setBatchId(value);
    if (csv) void runPreview(csv, value);
  }

  async function runImport() {
    if (!preview || preview.summary.valid === 0) return;
    const skipNote = preview.summary.invalid > 0 ? ` ${preview.summary.invalid} row(s) with problems will be skipped.` : "";
    if (!window.confirm(`Create ${preview.summary.valid} ${students ? "student" : "faculty"} account(s)?${skipNote}`)) return;
    setBusy("import");
    setError(null);
    const r = await runImportAction(kind, csv, batchId || null);
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setResult(r.data);
    setPreview(null);
    setCsv("");
    setFileName(null);
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setError(null);
    setCsv("");
    setPasted("");
    setFileName(null);
  }

  const credentialsCsv = result
    ? [csvLine(["Name", "Email", identLabel, "Temporary password"]), ...result.created.map((c) => csvLine([c.name, c.email, c.ident, c.temporaryPassword]))].join("\r\n") + "\r\n"
    : "";
  const skippedCsv = result
    ? [csvLine(["Line", "Name", "Email", identLabel, "Problems"]), ...result.skipped.map((s) => csvLine([s.line, s.name, s.email, s.ident, s.errors.join("; ")]))].join("\r\n") + "\r\n"
    : "";

  const shown = preview ? (onlyProblems ? preview.rows.filter((r) => !r.ok) : preview.rows) : [];

  return (
    <div className="space-y-6">
      {!result && (
        <Card title="1. Choose your file">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm" />
              {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
            </div>

            {students && (
              <label className="block text-sm font-medium">
                Enroll everyone in (optional)
                <select value={batchId} onChange={(e) => onBatch(e.target.value)} className={`${inputClass} max-w-sm`}>
                  <option value="">No batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  A <code>batch</code> column in the file overrides this for that row.
                </span>
              </label>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Or paste CSV text instead</summary>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={6}
                className={`${inputClass} font-mono`}
                placeholder="name,email,roll_no&#10;Asha Rao,asha@example.com,2026-101"
              />
              <button
                type="button"
                onClick={() => void onPaste()}
                disabled={!pasted.trim() || busy !== null}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
              >
                Preview pasted data
              </button>
            </details>
          </div>
        </Card>
      )}

      {busy === "preview" && <p className="text-sm text-slate-500">Checking your file…</p>}
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {preview && !result && (
        <Card title="2. Check the preview">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="green">{preview.summary.valid} ready</Badge>
            <Badge tone={preview.summary.invalid > 0 ? "red" : "slate"}>{preview.summary.invalid} with problems</Badge>
            <label className="ml-auto flex items-center gap-2">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              Show only problems
            </label>
          </div>
          {preview.ignoredColumns.length > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Ignored columns: {preview.ignoredColumns.join(", ")}
            </p>
          )}

          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">{identLabel}</th>
                  {students && <th className="px-3 py-2">Batch</th>}
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.line} className={r.ok ? "" : "bg-red-50/50"}>
                    <td className="px-3 py-2 text-slate-500">{r.line}</td>
                    <td className="px-3 py-2">{r.name || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email || "—"}</td>
                    <td className="px-3 py-2">{r.ident || "—"}</td>
                    {students && <td className="px-3 py-2 text-slate-600">{r.batch ?? "—"}</td>}
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <Badge tone="green">Ready</Badge>
                      ) : (
                        <ul className="list-disc pl-4 text-xs text-red-700">
                          {r.errors.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={students ? 6 : 5} className="px-3 py-4 text-slate-500">
                      No rows to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void runImport()}
              disabled={busy !== null || preview.summary.valid === 0}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy === "import" ? "Importing…" : `Import ${preview.summary.valid} ${students ? "student(s)" : "faculty member(s)"}`}
            </button>
            <span className="text-xs text-slate-500">
              Fix problems in your file and choose it again to re-check. Nothing is saved until you click Import.
            </span>
          </div>
        </Card>
      )}

      {result && (
        <Card title="Import finished">
          <p className="text-sm">
            <b>{result.summary.created}</b> created · <b>{result.summary.skipped}</b> skipped (of {result.summary.total} rows)
          </p>

          {result.created.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="font-medium text-amber-900">Download the temporary passwords now.</p>
              <p className="mt-1 text-amber-800">
                They are shown only here, only once, and are not stored anywhere. Leaving this page loses them.
              </p>
              <a
                href={csvDataUrl(credentialsCsv)}
                download={`${kind}-credentials.csv`}
                className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
              >
                Download credentials (CSV)
              </a>
              <details className="mt-3">
                <summary className="cursor-pointer text-amber-900">Show them on screen</summary>
                <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {result.created.map((c) => (
                        <tr key={c.email}>
                          <td className="px-3 py-1.5">{c.name}</td>
                          <td className="px-3 py-1.5 text-slate-600">{c.email}</td>
                          <td className="select-all px-3 py-1.5 font-mono">{c.temporaryPassword}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Skipped rows</span>
                <a href={csvDataUrl(skippedCsv)} download={`${kind}-skipped.csv`} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
                  Download skipped rows (CSV)
                </a>
              </div>
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs text-red-700">
                {result.skipped.map((s) => (
                  <li key={s.line}>
                    Line {s.line}, {s.name || s.email || "blank row"}: {s.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={reset} className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
            Import another file
          </button>
        </Card>
      )}
    </div>
  );
}
