"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";
import { fail, field, uuid, type FormState } from "@/lib/form";
import { isDateStr } from "@/lib/date";

const STATUSES = ["present", "absent", "late", "excused"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveAttendanceAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  const date = field(fd, "date");
  if (!batchId || !isDateStr(date)) return { status: "error", message: "Pick a batch and a date, then try again." };

  // Radios are named s_<studentId>. Students left unselected are simply not sent.
  const records: { studentId: string; status: string }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("s_") || typeof value !== "string" || !STATUSES.includes(value)) continue;
    const studentId = key.slice(2);
    if (UUID.test(studentId)) records.push({ studentId, status: value });
  }
  if (records.length === 0) return { status: "error", message: "Mark at least one student first." };

  const r = await apiSend<{ saved: number }>("PUT", "/attendance", { batchId, date, records });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/attendance");
  revalidatePath("/teacher/attendance");
  return { status: "success", message: `Saved attendance for ${r.data.saved} student(s).` };
}
