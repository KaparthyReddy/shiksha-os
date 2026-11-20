import Link from "next/link";
import { Badge, Pager, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import { qs } from "@/lib/qs";
import type { ExamListRow, Paged } from "@/lib/types";

const PAGE_SIZE = 15;
const STATUSES = ["draft", "published", "closed"];
const tone = { draft: "slate", published: "green", closed: "amber" } as const;

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;
  const list = await api<Paged<ExamListRow>>(`/exams${qs({ q, status, page, pageSize: PAGE_SIZE })}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Exams</h1>
        <Link href="/staff/exams/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          New exam
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Filter</button>
      </form>

      <Table head={["Title", "Status", "Questions", "Duration", "Window", "Attempts"]}>
        {list.items.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-slate-500">
              No exams found.
            </td>
          </tr>
        )}
        {list.items.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-3 font-medium">
              <Link href={`/staff/exams/${e.id}`} className="hover:underline">
                {e.title}
              </Link>
            </td>
            <td className="px-4 py-3">
              <Badge tone={tone[e.status as keyof typeof tone] ?? "slate"}>{e.status}</Badge>
            </td>
            <td className="px-4 py-3">{e.questionCount}</td>
            <td className="px-4 py-3">{e.durationMinutes} min</td>
            <td className="px-4 py-3 text-xs text-slate-600">
              {e.startsAt || e.endsAt ? `${fmtDateTime(e.startsAt)} to ${fmtDateTime(e.endsAt)}` : "Always open"}
            </td>
            <td className="px-4 py-3">{e.attempts}</td>
          </tr>
        ))}
      </Table>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={list.total}
        hrefFor={(p) => `/staff/exams${qs({ q, status, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
