import Link from "next/link";
import { Badge, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { BatchRow, ExamRow, Paged } from "@/lib/types";

const badge = { draft: "slate", published: "green", closed: "amber" } as const;

export default async function TeacherHome() {
  const [batches, exams] = await Promise.all([api<BatchRow[]>("/batches"), api<Paged<ExamRow>>("/exams?pageSize=50")]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Your batches</h2>
        {batches.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            You aren&apos;t assigned to any batch yet. Ask an admin to assign you from the batch page.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-slate-500">{b.courseName}</div>
                <div className="mt-2 text-sm">
                  {b.enrolled}
                  {b.capacity ? ` / ${b.capacity}` : ""} students
                </div>
                <Link href={`/teacher/attendance?batchId=${b.id}`} className="mt-3 inline-block text-sm text-indigo-600 hover:underline">
                  Mark attendance
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Exams</h2>
          <Link href="/staff/exams/new" className="text-sm text-indigo-600 hover:underline">
            New exam
          </Link>
        </div>
        <Table head={["Title", "Status", "Questions", "Duration", "Attempts"]}>
          {exams.items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-slate-500">
                No exams yet.
              </td>
            </tr>
          )}
          {exams.items.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium">
                <Link href={`/staff/exams/${e.id}`} className="hover:underline">
                  {e.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Badge tone={badge[e.status as keyof typeof badge] ?? "slate"}>{e.status}</Badge>
              </td>
              <td className="px-4 py-3">{e.questionCount}</td>
              <td className="px-4 py-3">{e.durationMinutes} min</td>
              <td className="px-4 py-3">{e.attempts}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
