import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import Stat from "@/components/Stat";
import { Badge, Card, Label, Table, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { inr } from "@/lib/format";
import { rupeesInput } from "@/lib/money";
import type { InvoiceDetail } from "@/lib/types";
import { recordPaymentAction, voidInvoiceAction } from "../../fee-actions";

const tone = { paid: "green", partial: "amber", pending: "slate", void: "red" } as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let inv: InvoiceDetail;
  try {
    inv = await api<InvoiceDetail>(`/invoices/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const payable = inv.status === "pending" || inv.status === "partial";
  const voidable = inv.status !== "void" && inv.paidPaise === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/fees" className="text-sm text-slate-500 hover:underline">
            ← Fees
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            Invoice for{" "}
            <Link href={`/admin/students/${inv.studentId}`} className="hover:underline">
              {inv.studentName}
            </Link>
          </h1>
          <p className="text-sm text-slate-500">
            {inv.rollNo} · due {inv.dueOn ?? "no due date"}
          </p>
        </div>
        <Badge tone={tone[inv.status as keyof typeof tone] ?? "slate"}>{inv.status}</Badge>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Amount" value={inr(inv.amountPaise)} />
        <Stat label="Paid" value={inr(inv.paidPaise)} />
        <Stat label="Outstanding" value={inr(inv.outstandingPaise)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Record a payment">
          {payable ? (
            <ActionForm action={recordPaymentAction} submitLabel="Record payment" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={inv.id} />
              <Label text="Amount (₹)">
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  defaultValue={rupeesInput(inv.outstandingPaise)}
                  className={inputClass}
                />
              </Label>
              <Label text="Method">
                <select name="method" required defaultValue="cash" className={inputClass}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Net banking</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
              </Label>
              <div className="sm:col-span-2">
                <Label text="Reference (optional)">
                  <input name="reference" placeholder="UPI transaction id, cheque no., etc." className={inputClass} />
                </Label>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-slate-500">
              {inv.status === "paid" ? "This invoice is fully paid." : "This invoice is void, so it can't take payments."}
            </p>
          )}
        </Card>

        <Card title="Void invoice">
          {voidable ? (
            <>
              <p className="mb-3 text-sm text-slate-600">Voiding cancels an invoice raised by mistake. It can't be undone.</p>
              <ActionForm
                action={voidInvoiceAction}
                submitLabel="Void invoice"
                variant="danger"
                confirm="Void this invoice? This can't be undone."
              >
                <input type="hidden" name="id" value={inv.id} />
              </ActionForm>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {inv.status === "void"
                ? "This invoice is already void."
                : "Invoices with payments can't be voided. Refunds aren't supported yet."}
            </p>
          )}
        </Card>
      </div>

      <Table head={["Receipt", "Date", "Method", "Reference", "Amount", ""]}>
        {inv.payments.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-slate-500">
              No payments yet.
            </td>
          </tr>
        )}
        {inv.payments.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 font-medium">{p.receiptNo}</td>
            <td className="px-4 py-3 text-slate-600">{p.receivedAt.slice(0, 10)}</td>
            <td className="px-4 py-3">{p.method.replace(/_/g, " ")}</td>
            <td className="px-4 py-3 text-slate-600">{p.reference ?? "—"}</td>
            <td className="px-4 py-3">{inr(p.amountPaise)}</td>
            <td className="px-4 py-3 text-right"><a href={`/api/receipt/${p.receiptNo}`} className="text-indigo-600 hover:underline">Receipt PDF</a></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
