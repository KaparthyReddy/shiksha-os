import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Badge, Pager, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { qs } from "@/lib/qs";
import type { Paged, QuestionRow } from "@/lib/types";
import { deleteQuestionAction } from "../actions";

const PAGE_SIZE = 15;
const TYPE = { single_choice: "Single", multi_choice: "Multiple", numeric: "Numeric" } as const;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;
  const subject = sp.subject?.trim() || undefined;
  const list = await api<Paged<QuestionRow>>(`/questions${qs({ q, subject, page, pageSize: PAGE_SIZE })}`);

  const field =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Question bank</h1>
        <Link href="/staff/questions/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Add question
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search question text" className={`${field} w-64`} />
        <input name="subject" defaultValue={subject} placeholder="Subject" className={`${field} w-40`} />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Filter</button>
      </form>

      <Table head={["Question", "Subject", "Type", "Marks", ""]}>
        {list.items.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-slate-500">
              No questions found.
            </td>
          </tr>
        )}
        {list.items.map((x) => (
          <tr key={x.id}>
            <td className="max-w-md px-4 py-3">{clip(x.body, 140)}</td>
            <td className="px-4 py-3 text-slate-600">
              {x.subject}
              {x.topic ? <div className="text-xs text-slate-500">{x.topic}</div> : null}
            </td>
            <td className="px-4 py-3">
              <Badge>{TYPE[x.type]}</Badge>
            </td>
            <td className="px-4 py-3">
              +{x.marks} / −{x.negativeMarks}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <Link href={`/staff/questions/${x.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
                  Edit
                </Link>
                <ActionForm action={deleteQuestionAction} submitLabel="Delete" variant="plain" inline confirm="Delete this question?">
                  <input type="hidden" name="id" value={x.id} />
                </ActionForm>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={list.total}
        hrefFor={(p) => `/staff/questions${qs({ q, subject, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
