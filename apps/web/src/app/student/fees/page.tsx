import { Badge, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import type { MyInvoiceFull } from "@/lib/types";

const tone = { paid: "green", partial: "amber", pending: "slate", void: "red" } as const;

export default async function StudentFees() {
  const invoices = (await api<MyInvoiceFull[]>("/me/invoices")).filter((i) => i.status !== "void");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your invoices</h1>
      {invoices.length === 0 && <p className="text-sm text-slate-500">You have no invoices.</p>}

      {invoices.map((i) => (
        <Card key={i.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{inr(i.amountPaise)}</div>
              <div className="text-xs text-slate-500">{i.dueOn ? `Due ${i.dueOn}` : "No due date"}</div>
            </div>
            <div className="text-right text-sm">
              <Badge tone={tone[i.status as keyof typeof tone] ?? "slate"}>{i.status}</Badge>
              <div className="mt-1 text-slate-600">
                {inr(i.paidPaise)} paid · {inr(i.outstandingPaise)} outstanding
              </div>
            </div>
          </div>
          {i.payments.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {i.payments.map((p) => (
                <div key={p.receiptNo} className="flex justify-between py-2">
                  <span>
                    {p.receiptNo} <span className="text-slate-500">· {p.receivedAt.slice(0, 10)} · {p.method.replace(/_/g, " ")}</span>
                  </span>
                  <span>{inr(p.amountPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
      <p className="text-xs text-slate-500">Receipts are emailed to you each time a payment is recorded.</p>
    </div>
  );
}
