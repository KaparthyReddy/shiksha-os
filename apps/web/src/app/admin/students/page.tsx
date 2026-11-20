import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Badge, Label, Pager, Table, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { qs } from "@/lib/qs";
import type { BatchRow, Paged, StudentRow } from "@/lib/types";
import { createStudentAction } from "../actions";

const PAGE_SIZE = 15;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; batchId?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;

  const [list, batches] = await Promise.all([
    api<Paged<StudentRow>>(`/students${qs({ q, page, pageSize: PAGE_SIZE, batchId: sp.batchId })}`),
    api<BatchRow[]>("/batches"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Students</h1>
        <form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email or roll no."
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Search</button>
        </form>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Add a student</summary>
        <div className="mt-4">
          <ActionForm action={createStudentAction} submitLabel="Create student" className="grid gap-4 sm:grid-cols-2">
            <Label text="Full name">
              <input name="name" required className={inputClass} />
            </Label>
            <Label text="Email">
              <input name="email" type="email" required className={inputClass} />
            </Label>
            <Label text="Roll number">
              <input name="rollNo" required className={inputClass} />
            </Label>
            <Label text="Batch (optional)">
              <select name="batchId" className={inputClass} defaultValue="">
                <option value="">No batch yet</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Guardian name (optional)">
              <input name="guardianName" className={inputClass} />
            </Label>
            <Label text="Guardian phone (optional)">
              <input name="guardianPhone" className={inputClass} />
            </Label>
          </ActionForm>
        </div>
      </details>

      <Table head={["Name", "Roll no.", "Email", "Guardian", "Status"]}>
        {list.items.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-slate-500">
              No students found.
            </td>
          </tr>
        )}
        {list.items.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3 font-medium">
              <Link href={`/admin/students/${s.id}`} className="hover:underline">
                {s.name}
              </Link>
            </td>
            <td className="px-4 py-3">{s.rollNo}</td>
            <td className="px-4 py-3 text-slate-600">{s.email}</td>
            <td className="px-4 py-3 text-slate-600">{s.guardianName ?? "—"}</td>
            <td className="px-4 py-3">
              <Badge tone={s.isActive ? "green" : "red"}>{s.isActive ? "Active" : "Deactivated"}</Badge>
            </td>
          </tr>
        ))}
      </Table>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={list.total}
        hrefFor={(p) => `/admin/students${qs({ q, batchId: sp.batchId, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
