import Link from "next/link";
import { notFound } from "next/navigation";
import Stat from "@/components/Stat";
import { Badge, Table } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import type { ExamResults } from "@/lib/types";

const statusTone = { submitted: "green", expired: "amber", in_progress: "slate" } as const;

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: ExamResults;
  try {
    data = await api<ExamResults>(`/exams/${id}/results`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }

  const scores = data.results.flatMap((r) => (r.score === null ? [] : [r.score]));
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
  const pct = (score: number) => (data.maxScore > 0 ? `${Math.round((score / data.maxScore) * 1000) / 10}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/staff/exams/${id}`} className="text-sm text-slate-500 hover:underline">
            ← {data.exam.title}
          </Link>
          <h1 className="mt-1 text-xl font-semibold">Results</h1>
        </div>
        <a
          href={`/api/staff/exams/${id}/results/csv`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Download CSV
        </a>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attempted" value={String(data.attempted)} />
        <Stat label="Average" value={avg === null ? "—" : `${avg} / ${data.maxScore}`} />
        <Stat label="Highest" value={scores.length ? String(Math.max(...scores)) : "—"} />
        <Stat label="Lowest" value={scores.length ? String(Math.min(...scores)) : "—"} />
      </section>

      <Table head={["Rank", "Student", "Roll no.", "Status", "Score", "%", "Late sync", "Submitted", ""]}>
        {data.results.length === 0 && (
          <tr>
            <td colSpan={9} className="px-4 py-6 text-slate-500">
              Nobody has attempted this exam yet.
            </td>
          </tr>
        )}
        {data.results.map((r) => (
          <tr key={r.sessionId}>
            <td className="px-4 py-3 font-medium">{r.rank ?? "—"}</td>
            <td className="px-4 py-3">{r.name}</td>
            <td className="px-4 py-3 text-slate-600">{r.rollNo}</td>
            <td className="px-4 py-3">
              <Badge tone={statusTone[r.status as keyof typeof statusTone] ?? "slate"}>{r.status.replace("_", " ")}</Badge>
            </td>
            <td className="px-4 py-3">{r.score === null ? "—" : `${r.score} / ${data.maxScore}`}</td>
            <td className="px-4 py-3">{r.score === null ? "—" : pct(r.score)}</td>
            <td className="px-4 py-3">{r.lateAnswers > 0 ? <Badge tone="amber">{r.lateAnswers} late</Badge> : "—"}</td>
            <td className="px-4 py-3 text-xs text-slate-600">{fmtDateTime(r.submittedAt)}</td>
            <td className="px-4 py-3 text-right text-xs"><a href={`/api/report-card?studentId=${r.studentId}`} target="_blank" className="text-indigo-600 hover:underline">Report card</a></td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-slate-500">
        Students with equal scores share a rank. &quot;Late sync&quot; counts answers that reached the server after the deadline, within the
        5-minute resume window. They were typed before time ran out but delivered late, so review them if a rank is close.
      </p>
    </div>
  );
}
