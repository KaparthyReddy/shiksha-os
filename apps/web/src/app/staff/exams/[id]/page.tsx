import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import Stat from "@/components/Stat";
import { Badge, Card } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import type { BatchRow, ExamDetail } from "@/lib/types";
import { closeExamAction, deleteExamAction, publishExamAction, releaseResultsAction } from "../../actions";

const tone = { draft: "slate", published: "green", closed: "amber" } as const;
const TYPE = { single_choice: "Single correct", multi_choice: "Multiple correct", numeric: "Numeric" } as const;

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let exam: ExamDetail;
  try {
    exam = await api<ExamDetail>(`/exams/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const batches = await api<BatchRow[]>("/batches");
  const audience = exam.batchId ? (batches.find((b) => b.id === exam.batchId)?.name ?? "A batch") : "All students";
  const totalMarks = exam.questions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/staff/exams" className="text-sm text-slate-500 hover:underline">
            ← Exams
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{exam.title}</h1>
          <p className="text-sm text-slate-500">
            {audience} · {exam.shuffle ? "shuffled" : "fixed order"}
          </p>
        </div>
        <Badge tone={tone[exam.status as keyof typeof tone] ?? "slate"}>{exam.status}</Badge>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Questions" value={String(exam.questions.length)} />
        <Stat label="Total marks" value={String(totalMarks)} />
        <Stat label="Duration" value={`${exam.durationMinutes} min`} />
        <Stat
          label="Window"
          value={exam.startsAt || exam.endsAt ? "Scheduled" : "Always open"}
          hint={exam.startsAt || exam.endsAt ? `${fmtDateTime(exam.startsAt)} to ${fmtDateTime(exam.endsAt)}` : undefined}
        />
      </section>

      {!exam.resultsReleased && (
        <Card title="Results are hidden from students">
          <p className="mb-3 text-sm text-slate-600">
            Students who submit see a confirmation but no score, and the exam stays out of their report cards, until you release it.
          </p>
          <ActionForm action={releaseResultsAction} submitLabel="Release results" inline confirm="Release the results to students? They will see their scores right away.">
            <input type="hidden" name="id" value={exam.id} />
          </ActionForm>
        </Card>
      )}

      <Card title="Control">
        <div className="flex flex-wrap items-center gap-3">
          {exam.status === "draft" && (
            <>
              <ActionForm action={publishExamAction} submitLabel="Publish exam" inline>
                <input type="hidden" name="id" value={exam.id} />
              </ActionForm>
              <ActionForm
                action={deleteExamAction}
                submitLabel="Delete draft"
                variant="danger"
                inline
                confirm="Delete this draft exam? This can't be undone."
              >
                <input type="hidden" name="id" value={exam.id} />
              </ActionForm>
            </>
          )}
          {exam.status === "published" && (
            <ActionForm
              action={closeExamAction}
              submitLabel="Close exam"
              variant="danger"
              inline
              confirm="Close this exam? Students who haven't started won't be able to. Students already mid-exam keep their own deadline."
            >
              <input type="hidden" name="id" value={exam.id} />
            </ActionForm>
          )}
          {exam.status !== "draft" && (
            <Link href={`/staff/exams/${exam.id}/results`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              View results
            </Link>
          )}
        </div>
        {exam.status === "draft" && (
          <p className="mt-3 text-xs text-slate-500">Drafts are invisible to students. Publishing opens the exam to its audience.</p>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Questions and answer key</h2>
        {exam.questions.map((q, i) => (
          <Card key={q.id}>
            <div className="flex justify-between gap-3 text-xs text-slate-500">
              <span>
                Q{i + 1} · {q.subject} · {TYPE[q.type]}
              </span>
              <span>
                +{q.marks} / −{q.negativeMarks}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{q.body}</p>
            {q.type === "numeric" ? (
              <p className="mt-2 text-sm">
                Answer: <b className="text-emerald-700">{q.correct[0]}</b>
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {(q.options ?? []).map((o, j) => {
                  const right = q.correct.includes(o.id);
                  return (
                    <li key={o.id} className={right ? "font-medium text-emerald-700" : "text-slate-600"}>
                      {String.fromCharCode(65 + j)}. {o.text}
                      {right ? " ✓" : ""}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
}
