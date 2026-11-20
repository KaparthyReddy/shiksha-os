"use server";

import { revalidatePath } from "next/cache";
import { apiRead, apiSend } from "@/lib/api";
import { fail, field, uuid, type FormState } from "@/lib/form";
import { parseRupees } from "@/lib/money";
import { qs } from "@/lib/qs";
import type { Paged } from "@/lib/types";

const done = (message: string): FormState => ({ status: "success", message });
const problem = (message: string): FormState => ({ status: "error", message });
const AMOUNT_HELP = "Enter an amount in rupees, like 25000 or 1499.50.";
const METHODS = ["cash", "upi", "card", "netbanking", "bank_transfer"];

function refresh(invoiceId?: string) {
  revalidatePath("/admin/fees");
  revalidatePath("/admin");
  if (invoiceId) revalidatePath(`/admin/fees/${invoiceId}`);
}

async function studentByRoll(roll: string) {
  const found = await apiRead<Paged<{ id: string; rollNo: string }>>(`/students${qs({ q: roll, pageSize: 20 })}`);
  if (!found.ok) return found;
  const match = found.data.items.find((s) => s.rollNo.toLowerCase() === roll.toLowerCase());
  return match ? { ok: true as const, data: match } : { ok: false as const, message: `No student has roll number ${roll}.` };
}

export async function createFeePlanAction(_: FormState, fd: FormData): Promise<FormState> {
  const amountPaise = parseRupees(field(fd, "amount"));
  if (!amountPaise) return problem(AMOUNT_HELP);
  const r = await apiSend("POST", "/fee-plans", {
    name: field(fd, "name"),
    amountPaise,
    description: field(fd, "description"),
  });
  if (!r.ok) return fail(r);
  refresh();
  return done("Fee plan created.");
}

export async function bulkInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  const feePlanId = uuid(fd, "feePlanId");
  if (!batchId || !feePlanId) return problem("Choose a batch and a fee plan.");
  const r = await apiSend<{ created: number; skipped: number }>("POST", "/invoices/bulk", {
    batchId,
    feePlanId,
    dueOn: field(fd, "dueOn"),
  });
  if (!r.ok) return fail(r);
  refresh();
  const { created, skipped } = r.data;
  return done(`Created ${created} invoice(s)${skipped > 0 ? `, skipped ${skipped} who already had one` : ""}.`);
}

export async function createInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const roll = field(fd, "rollNo");
  if (!roll) return problem("Enter the student's roll number.");

  const feePlanId = uuid(fd, "feePlanId");
  const rawAmount = field(fd, "amount");
  let amountPaise: number | undefined;
  if (rawAmount) {
    const p = parseRupees(rawAmount);
    if (!p) return problem(AMOUNT_HELP);
    amountPaise = p;
  }
  if (!feePlanId && !amountPaise) return problem("Choose a fee plan or enter an amount.");

  const student = await studentByRoll(roll);
  if (!student.ok) return fail(student);

  const r = await apiSend("POST", "/invoices", {
    studentId: student.data.id,
    feePlanId,
    amountPaise,
    dueOn: field(fd, "dueOn"),
  });
  if (!r.ok) return fail(r);
  refresh();
  return done(`Invoice created for ${roll}.`);
}

export async function recordPaymentAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Invoice is missing. Reload the page and try again.");
  const amountPaise = parseRupees(field(fd, "amount"));
  if (!amountPaise) return problem(AMOUNT_HELP);
  const method = field(fd, "method");
  if (!method || !METHODS.includes(method)) return problem("Choose a payment method.");

  const r = await apiSend<{ payment: { receiptNo: string } }>("POST", `/invoices/${id}/payments`, {
    amountPaise,
    method,
    reference: field(fd, "reference"),
  });
  if (!r.ok) return fail(r);
  refresh(id);
  return done(`Payment recorded. Receipt ${r.data.payment.receiptNo} will be emailed to the student within a minute.`);
}

export async function voidInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Invoice is missing. Reload the page and try again.");
  const r = await apiSend("POST", `/invoices/${id}/void`);
  if (!r.ok) return fail(r);
  refresh(id);
  return done("Invoice voided.");
}
