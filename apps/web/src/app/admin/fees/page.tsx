import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import Stat from "@/components/Stat";
import { Badge, Card, Label, Pager, Table, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { qs } from "@/lib/qs";
import type { BatchRow, FeePlan, FeesSummary, InvoiceListRow, Paged } from "@/lib/types";
import { bulkInvoiceAction, createFeePlanAction, createInvoiceAction } from "../fee-actions";

const PAGE_SIZE = 15;
const STATUSES = ["pending", "partial", "paid", "void"];
const tone = { paid: "green", partial: "amber", pending: "slate", void: "red" } as const;

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || undefined;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : undefined;

  const [summary, plans, batches, list] = await Promise.all([
    api<FeesSummary>("/fees/summary"),
    api<FeePlan[]>("/fee-plans"),
    api<BatchRow[]>("/batches"),
    api<Paged<InvoiceListRow>>(`/invoices${qs({ q, status, page, pageSize: PAGE_SIZE })}`),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Fees</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced" value={inr(summary.invoicedPaise)} />
        <Stat label="Collected" value={inr(summary.collectedPaise)} />
        <Stat label="Pending" value={inr(summary.pendingPaise)} />
        <Stat label="Overdue invoices" value={String(summary.overdueCount)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New fee plan">
          <ActionForm action={createFeePlanAction} submitLabel="Create plan">
            <Label text="Name">
              <input name="name" required placeholder="Term 2 tuition" className={inputClass} />
            </Label>
            <Label text="Amount (₹)">
              <input name="amount" required inputMode="decimal" placeholder="25000" className={inputClass} />
            </Label>
            <Label text="Description (optional)">
              <input name="description" className={inputClass} />
            </Label>
          </ActionForm>
          {plans.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2 text-sm">
              {plans.map((p) => (
                <div key={p.id} className="flex justify-between py-1.5">
                  <span>{p.name}</span>
                  <span className="text-slate-500">{inr(p.amountPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Invoice a whole batch">
          {plans.length === 0 || batches.length === 0 ? (
            <p className="text-sm text-slate-500">Create a fee plan and a batch first.</p>
          ) : (
            <ActionForm action={bulkInvoiceAction} submitLabel="Create invoices">
              <Label text="Batch">
                <select name="batchId" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Choose a batch
                  </option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Fee plan">
                <select name="feePlanId" required defaultValue="" className={inputClass}>
                  <option value="" disabled>
                    Choose a plan
                  </option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {inr(p.amountPaise)}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Due date (optional)">
                <input name="dueOn" type="date" className={inputClass} />
              </Label>
              <p className="text-xs text-slate-500">Students who already have an invoice for this plan are skipped.</p>
            </ActionForm>
          )}
        </Card>

        <Card title="Invoice one student">
          <ActionForm action={createInvoiceAction} submitLabel="Create invoice">
            <Label text="Roll number">
              <input name="rollNo" required className={inputClass} />
            </Label>
            <Label text="Fee plan (optional)">
              <select name="feePlanId" defaultValue="" className={inputClass}>
                <option value="">No plan, custom amount</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {inr(p.amountPaise)}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Amount (₹), overrides the plan">
              <input name="amount" inputMode="decimal" className={inputClass} />
            </Label>
            <Label text="Due date (optional)">
              <input name="dueOn" type="date" className={inputClass} />
            </Label>
          </ActionForm>
        </Card>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search student name or roll no."
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

      <Table head={["Student", "Amount", "Paid", "Outstanding", "Due", "Status"]}>
        {list.items.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-slate-500">
              No invoices found.
            </td>
          </tr>
        )}
        {list.items.map((i) => (
          <tr key={i.id}>
            <td className="px-4 py-3">
              <Link href={`/admin/fees/${i.id}`} className="font-medium hover:underline">
                {i.studentName}
              </Link>
              <div className="text-xs text-slate-500">{i.rollNo}</div>
            </td>
            <td className="px-4 py-3">{inr(i.amountPaise)}</td>
            <td className="px-4 py-3">{inr(i.paidPaise)}</td>
            <td className="px-4 py-3">{inr(i.outstandingPaise)}</td>
            <td className="px-4 py-3 text-slate-600">{i.dueOn ?? "—"}</td>
            <td className="px-4 py-3">
              <span className="flex flex-wrap gap-1">
                <Badge tone={tone[i.status as keyof typeof tone] ?? "slate"}>{i.status}</Badge>
                {i.overdue && <Badge tone="red">overdue</Badge>}
              </span>
            </td>
          </tr>
        ))}
      </Table>

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={list.total}
        hrefFor={(p) => `/admin/fees${qs({ q, status, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
