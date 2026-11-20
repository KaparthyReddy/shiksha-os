import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Card, Label, Table, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import type { BatchListRow, CourseRow } from "@/lib/types";
import { createBatchAction, createCourseAction } from "../actions";

export default async function BatchesPage() {
  const [courses, batches] = await Promise.all([api<CourseRow[]>("/courses"), api<BatchListRow[]>("/batches")]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Courses and batches</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="New course">
          <ActionForm action={createCourseAction} submitLabel="Create course" className="grid gap-4 sm:grid-cols-2">
            <Label text="Name">
              <input name="name" required placeholder="NEET Foundation" className={inputClass} />
            </Label>
            <Label text="Code">
              <input name="code" required placeholder="NEET-F" className={inputClass} />
            </Label>
          </ActionForm>
          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2 text-sm">
            {courses.length === 0 && <p className="py-2 text-slate-500">No courses yet.</p>}
            {courses.map((c) => (
              <div key={c.id} className="flex justify-between py-2">
                <span>
                  <span className="font-medium">{c.name}</span> <span className="text-slate-500">({c.code})</span>
                </span>
                <span className="text-slate-500">{c.batchCount} batches</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="New batch">
          {courses.length === 0 ? (
            <p className="text-sm text-slate-500">Create a course first.</p>
          ) : (
            <ActionForm action={createBatchAction} submitLabel="Create batch" className="grid gap-4 sm:grid-cols-2">
              <Label text="Course">
                <select name="courseId" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Choose a course
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Batch name">
                <input name="name" required placeholder="NEET 2028 - Evening" className={inputClass} />
              </Label>
              <Label text="Starts on (optional)">
                <input name="startsOn" type="date" className={inputClass} />
              </Label>
              <Label text="Ends on (optional)">
                <input name="endsOn" type="date" className={inputClass} />
              </Label>
              <Label text="Capacity (optional)">
                <input name="capacity" type="number" min={1} className={inputClass} />
              </Label>
            </ActionForm>
          )}
        </Card>
      </div>

      <Table head={["Batch", "Course", "Dates", "Enrolled"]}>
        {batches.length === 0 && (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-slate-500">
              No batches yet.
            </td>
          </tr>
        )}
        {batches.map((b) => {
          const pct = b.capacity ? Math.min(100, Math.round((b.enrolled / b.capacity) * 100)) : null;
          return (
            <tr key={b.id}>
              <td className="px-4 py-3 font-medium">
                <Link href={`/admin/batches/${b.id}`} className="hover:underline">
                  {b.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">{b.courseName}</td>
              <td className="px-4 py-3 text-slate-600">
                {b.startsOn ?? "—"} to {b.endsOn ?? "—"}
              </td>
              <td className="px-4 py-3">
                <div>
                  {b.enrolled}
                  {b.capacity ? ` / ${b.capacity}` : ""}
                </div>
                {pct !== null && (
                  <div className="mt-1 h-1.5 w-32 rounded bg-slate-100">
                    <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
