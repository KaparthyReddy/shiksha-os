"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";
import { localToIso } from "@/lib/date";
import { fail, field, uuid, type FormState } from "@/lib/form";

const problem = (message: string): FormState => ({ status: "error", message });
const success = (message: string): FormState => ({ status: "success", message });

export async function createLiveClassAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  if (!batchId) return problem("Choose a batch.");
  const title = field(fd, "title");
  if (!title) return problem("Enter a title.");
  const raw = field(fd, "scheduledAt");
  const scheduledAt = raw ? localToIso(raw) : null;
  if (!scheduledAt) return problem("Pick the date and time.");
  const durationMinutes = Number(field(fd, "durationMinutes"));
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    return problem("Duration must be a whole number of minutes between 5 and 480.");
  }
  const r = await apiSend("POST", "/live-classes", { batchId, title, scheduledAt, durationMinutes });
  if (!r.ok) return fail(r);
  revalidatePath("/staff/live");
  return success("Class scheduled.");
}

export async function endLiveClassAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Class is missing. Reload the page and try again.");
  const r = await apiSend("POST", `/live-classes/${id}/end`);
  if (!r.ok) return fail(r);
  revalidatePath(`/staff/live/${id}`);
  revalidatePath("/staff/live");
  return success("Class ended.");
}

export async function cancelLiveClassAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Class is missing. Reload the page and try again.");
  const r = await apiSend("POST", `/live-classes/${id}/cancel`);
  if (!r.ok) return fail(r);
  revalidatePath(`/staff/live/${id}`);
  revalidatePath("/staff/live");
  return success("Class cancelled.");
}

export async function liveAttendanceAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Class is missing. Reload the page and try again.");
  const minMinutes = Number(field(fd, "minMinutes") ?? "10");
  if (!Number.isFinite(minMinutes) || minMinutes < 0 || minMinutes > 240) return problem("Minutes must be between 0 and 240.");
  const r = await apiSend<{ date: string; present: number; absent: number }>("POST", `/live-classes/${id}/attendance`, { minMinutes });
  if (!r.ok) return fail(r);
  revalidatePath(`/staff/live/${id}`);
  revalidatePath("/admin/attendance");
  revalidatePath("/teacher/attendance");
  return success(
    `Attendance for ${r.data.date}: ${r.data.present} present, ${r.data.absent} absent. Marks you made by hand are kept.`,
  );
}
