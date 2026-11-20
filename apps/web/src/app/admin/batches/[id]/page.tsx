import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { Card, Table, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { BatchDetail } from "@/lib/types";
import { enrollByRollAction, unenrollAction } from "../../actions";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let batch: BatchDetail;
  try {
    batch = await api<BatchDetail>(`/batches/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const full = batch.capacity !== null && batch.enrolled >= batch.capacity;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/batches" className="text-sm text-slate-500 hover:underline">
          ← Courses and batches
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{batch.name}</h1>
        <p className="text-sm text-slate-500">
          {batch.courseName} · {batch.startsOn ?? "—"} to {batch.endsOn ?? "—"} · {batch.enrolled}
          {batch.capacity ? ` of ${batch.capacity}` : ""} students
        </p>
      </div>

      <Card title="Enroll a student">
        {full ? (
          <p className="text-sm text-amber-700">This batch is full.</p>
        ) : (
          <ActionForm action={enrollByRollAction} submitLabel="Enroll" inline>
            <input type="hidden" name="batchId" value={batch.id} />
            <input name="rollNo" required placeholder="Roll number" className={`${inputClass} !mt-0 w-56`} />
          </ActionForm>
        )}
      </Card>

      <Table head={["Roll no.", "Name", "Enrolled on", ""]}>
        {batch.students.length === 0 && (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-slate-500">
              No students enrolled yet.
            </td>
          </tr>
        )}
        {batch.students.map((s) => (
          <tr key={s.studentId}>
            <td className="px-4 py-3">{s.rollNo}</td>
            <td className="px-4 py-3 font-medium">
              <Link href={`/admin/students/${s.studentId}`} className="hover:underline">
                {s.name}
              </Link>
            </td>
            <td className="px-4 py-3 text-slate-600">{s.enrolledAt.slice(0, 10)}</td>
            <td className="px-4 py-3 text-right">
              <ActionForm
                action={unenrollAction}
                submitLabel="Remove"
                variant="plain"
                inline
                confirm={`Remove ${s.name} from this batch?`}
              >
                <input type="hidden" name="studentId" value={s.studentId} />
                <input type="hidden" name="batchId" value={batch.id} />
              </ActionForm>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
