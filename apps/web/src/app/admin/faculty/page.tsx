import ActionForm from "@/components/ActionForm";
import { Badge, Label, Pager, Table, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { qs } from "@/lib/qs";
import type { FacultyRow, Paged } from "@/lib/types";
import { createFacultyAction, setFacultyActiveAction } from "../actions";

const PAGE_SIZE = 20;

export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;
  const list = await api<Paged<FacultyRow>>(`/faculty${qs({ q, page, pageSize: PAGE_SIZE })}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Faculty</h1>
        <form method="get" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name or email"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Search</button>
        </form>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Add a faculty member</summary>
        <div className="mt-4">
          <ActionForm action={createFacultyAction} submitLabel="Create account" className="grid gap-4 sm:grid-cols-2">
            <Label text="Full name">
              <input name="name" required className={inputClass} />
            </Label>
            <Label text="Email">
              <input name="email" type="email" required className={inputClass} />
            </Label>
            <Label text="Designation (optional)">
              <input name="designation" className={inputClass} />
            </Label>
            <Label text="Subjects (comma-separated, optional)">
              <input name="subjects" placeholder="Physics, Mathematics" className={inputClass} />
            </Label>
          </ActionForm>
        </div>
      </details>

      <Table head={["Name", "Email", "Designation", "Subjects", "Status", ""]}>
        {list.items.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-slate-500">
              No faculty found.
            </td>
          </tr>
        )}
        {list.items.map((f) => (
          <tr key={f.id}>
            <td className="px-4 py-3 font-medium">{f.name}</td>
            <td className="px-4 py-3 text-slate-600">{f.email}</td>
            <td className="px-4 py-3">{f.designation ?? "—"}</td>
            <td className="px-4 py-3">{f.subjects && f.subjects.length > 0 ? f.subjects.join(", ") : "—"}</td>
            <td className="px-4 py-3">
              <Badge tone={f.isActive ? "green" : "red"}>{f.isActive ? "Active" : "Deactivated"}</Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <ActionForm
                action={setFacultyActiveAction}
                submitLabel={f.isActive ? "Deactivate" : "Reactivate"}
                variant="plain"
                inline
                confirm={f.isActive ? `Deactivate ${f.name}?` : undefined}
              >
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="active" value={String(!f.isActive)} />
              </ActionForm>
            </td>
          </tr>
        ))}
      </Table>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={list.total}
        hrefFor={(p) => `/admin/faculty${qs({ q, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
