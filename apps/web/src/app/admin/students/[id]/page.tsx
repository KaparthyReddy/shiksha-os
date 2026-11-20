import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { Badge, Card, Label, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { BatchRow, StudentDetail } from "@/lib/types";
import { enrollAction, setStudentActiveAction, unenrollAction, updateStudentAction } from "../../actions";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let student: StudentDetail;
  try {
    student = await api<StudentDetail>(`/students/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const batches = await api<BatchRow[]>("/batches");
  const enrolledIds = new Set(student.batches.map((b) => b.batchId));
  const open = batches.filter((b) => !enrolledIds.has(b.id));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
            ← Students
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{student.name}</h1>
          <p className="text-sm text-slate-500">{student.email}</p>
        </div>
        <Badge tone={student.isActive ? "green" : "red"}>{student.isActive ? "Active" : "Deactivated"}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <ActionForm action={updateStudentAction} submitLabel="Save changes" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={student.id} />
            <Label text="Full name">
              <input name="name" defaultValue={student.name} required className={inputClass} />
            </Label>
            <Label text="Roll number">
              <input name="rollNo" defaultValue={student.rollNo} required className={inputClass} />
            </Label>
            <Label text="Guardian name">
              <input name="guardianName" defaultValue={student.guardianName ?? ""} className={inputClass} />
            </Label>
            <Label text="Guardian phone">
              <input name="guardianPhone" defaultValue={student.guardianPhone ?? ""} className={inputClass} />
            </Label>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title="Batches">
            <div className="divide-y divide-slate-100">
              {student.batches.length === 0 && <p className="py-2 text-sm text-slate-500">Not enrolled in any batch.</p>}
              {student.batches.map((b) => (
                <div key={b.batchId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <Link href={`/admin/batches/${b.batchId}`} className="font-medium hover:underline">
                      {b.batchName}
                    </Link>
                    <div className="text-xs text-slate-500">{b.courseName}</div>
                  </div>
                  <ActionForm
                    action={unenrollAction}
                    submitLabel="Remove"
                    variant="plain"
                    inline
                    confirm={`Remove ${student.name} from ${b.batchName}?`}
                  >
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="batchId" value={b.batchId} />
                  </ActionForm>
                </div>
              ))}
            </div>
            {open.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <ActionForm action={enrollAction} submitLabel="Enroll" inline>
                  <input type="hidden" name="studentId" value={student.id} />
                  <select name="batchId" required defaultValue="" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="" disabled>
                      Choose a batch
                    </option>
                    {open.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </ActionForm>
              </div>
            )}
          </Card>

          <Card title="Account">
            <p className="mb-3 text-sm text-slate-600">
              Deactivating blocks sign-in and token refresh straight away. An access token already issued keeps working
              for up to 15 minutes.
            </p>
            <ActionForm
              action={setStudentActiveAction}
              submitLabel={student.isActive ? "Deactivate student" : "Reactivate student"}
              variant={student.isActive ? "danger" : "primary"}
              confirm={student.isActive ? `Deactivate ${student.name}? They will no longer be able to sign in.` : undefined}
            >
              <input type="hidden" name="id" value={student.id} />
              <input type="hidden" name="active" value={String(!student.isActive)} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
