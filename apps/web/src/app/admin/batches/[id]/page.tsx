import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { Card, Table, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { BatchDetail, BatchTeacher, FacultyRow, Paged } from "@/lib/types";
import { assignTeacherAction, enrollByRollAction, unassignTeacherAction, unenrollAction } from "../../actions";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let batch: BatchDetail;
  try {
    batch = await api<BatchDetail>(`/batches/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const [teachers, faculty] = await Promise.all([
    api<BatchTeacher[]>(`/batches/${id}/teachers`),
    api<Paged<FacultyRow>>("/faculty?pageSize=100"),
  ]);
  const assigned = new Set(teachers.map((t) => t.facultyId));
  const available = faculty.items.filter((f) => f.isActive && !assigned.has(f.id));
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

      <div className="grid gap-6 lg:grid-cols-2">
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

        <Card title="Teachers">
          <div className="divide-y divide-slate-100">
            {teachers.length === 0 && <p className="py-2 text-sm text-slate-500">No teachers assigned yet. Teachers only see batches they are assigned to.</p>}
            {teachers.map((t) => (
              <div key={t.facultyId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.designation ?? t.email}</div>
                </div>
                <ActionForm
                  action={unassignTeacherAction}
                  submitLabel="Remove"
                  variant="plain"
                  inline
                  confirm={`Remove ${t.name} from this batch?`}
                >
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="facultyId" value={t.facultyId} />
                </ActionForm>
              </div>
            ))}
          </div>
          {available.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ActionForm action={assignTeacherAction} submitLabel="Assign" inline>
                <input type="hidden" name="batchId" value={batch.id} />
                <select name="facultyId" required defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="" disabled>
                    Choose a teacher
                  </option>
                  {available.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </ActionForm>
            </div>
          )}
        </Card>
      </div>

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
