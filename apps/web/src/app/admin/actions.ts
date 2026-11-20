"use server";

import { revalidatePath } from "next/cache";
import { apiRead, apiSend } from "@/lib/api";
import { fail, field, nullable, uuid, type FormState } from "@/lib/form";
import { qs } from "@/lib/qs";
import type { Paged } from "@/lib/types";

const done = (message: string, secret?: { label: string; value: string }): FormState => ({
  status: "success",
  message,
  secret,
});
const problem = (message: string): FormState => ({ status: "error", message });
const missing = (what: string) => problem(`${what} is missing. Reload the page and try again.`);

const TEMP = "Temporary password (shown once, so copy it now)";

// ======================= Students =======================
export async function createStudentAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await apiSend<{ student: { name: string; rollNo: string }; temporaryPassword: string }>("POST", "/students", {
    name: field(fd, "name"),
    email: field(fd, "email"),
    rollNo: field(fd, "rollNo"),
    guardianName: field(fd, "guardianName"),
    guardianPhone: field(fd, "guardianPhone"),
    batchId: uuid(fd, "batchId"),
  });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/students");
  revalidatePath("/admin/batches");
  return done(`Created ${r.data.student.name} (${r.data.student.rollNo}).`, {
    label: TEMP,
    value: r.data.temporaryPassword,
  });
}

export async function updateStudentAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return missing("Student");
  const r = await apiSend("PATCH", `/students/${id}`, {
    name: field(fd, "name"),
    rollNo: field(fd, "rollNo"),
    guardianName: nullable(fd, "guardianName"),
    guardianPhone: nullable(fd, "guardianPhone"),
  });
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return done("Saved.");
}

export async function setStudentActiveAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return missing("Student");
  const r = await apiSend("PATCH", `/students/${id}`, { isActive: field(fd, "active") === "true" });
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return done("Updated.");
}

// ======================= Enrollment =======================
export async function enrollAction(_: FormState, fd: FormData): Promise<FormState> {
  const studentId = uuid(fd, "studentId");
  const batchId = uuid(fd, "batchId");
  if (!studentId) return missing("Student");
  if (!batchId) return problem("Choose a batch first.");
  const r = await apiSend("POST", `/batches/${batchId}/enrollments`, { studentId });
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath("/admin/batches");
  return done("Enrolled.");
}

export async function enrollByRollAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  const roll = field(fd, "rollNo");
  if (!batchId) return missing("Batch");
  if (!roll) return problem("Enter a roll number.");

  const found = await apiRead<Paged<{ id: string; rollNo: string }>>(`/students${qs({ q: roll, pageSize: 20 })}`);
  if (!found.ok) return fail(found);
  const match = found.data.items.find((s) => s.rollNo.toLowerCase() === roll.toLowerCase());
  if (!match) return problem(`No student has roll number ${roll}.`);

  const r = await apiSend("POST", `/batches/${batchId}/enrollments`, { studentId: match.id });
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/admin/students/${match.id}`);
  revalidatePath("/admin/batches");
  return done(`Enrolled ${roll}.`);
}

export async function unenrollAction(_: FormState, fd: FormData): Promise<FormState> {
  const studentId = uuid(fd, "studentId");
  const batchId = uuid(fd, "batchId");
  if (!studentId || !batchId) return missing("Student or batch");
  const r = await apiSend("DELETE", `/batches/${batchId}/enrollments/${studentId}`);
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath("/admin/batches");
  return done("Removed.");
}

// ======================= Courses and batches =======================
export async function createCourseAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await apiSend("POST", "/courses", { name: field(fd, "name"), code: field(fd, "code") });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/batches");
  return done("Course created.");
}

export async function createBatchAction(_: FormState, fd: FormData): Promise<FormState> {
  const cap = field(fd, "capacity");
  const r = await apiSend("POST", "/batches", {
    courseId: uuid(fd, "courseId"),
    name: field(fd, "name"),
    startsOn: field(fd, "startsOn"),
    endsOn: field(fd, "endsOn"),
    capacity: cap ? Number(cap) : undefined,
  });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/batches");
  return done("Batch created.");
}

// ======================= Faculty =======================
export async function createFacultyAction(_: FormState, fd: FormData): Promise<FormState> {
  const subjects = (field(fd, "subjects") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const r = await apiSend<{ faculty: { name: string }; temporaryPassword: string }>("POST", "/faculty", {
    name: field(fd, "name"),
    email: field(fd, "email"),
    designation: field(fd, "designation"),
    subjects: subjects.length > 0 ? subjects : undefined,
  });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/faculty");
  return done(`Created ${r.data.faculty.name}.`, { label: TEMP, value: r.data.temporaryPassword });
}

export async function setFacultyActiveAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return missing("Faculty member");
  const r = await apiSend("PATCH", `/faculty/${id}`, { isActive: field(fd, "active") === "true" });
  if (!r.ok) return fail(r);
  revalidatePath("/admin/faculty");
  return done("Updated.");
}

// ======================= Teachers on batches =======================
export async function assignTeacherAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  const facultyId = uuid(fd, "facultyId");
  if (!batchId) return missing("Batch");
  if (!facultyId) return problem("Choose a teacher first.");
  const r = await apiSend("POST", `/batches/${batchId}/teachers`, { facultyId });
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/batches/${batchId}`);
  return done("Teacher assigned.");
}

export async function unassignTeacherAction(_: FormState, fd: FormData): Promise<FormState> {
  const batchId = uuid(fd, "batchId");
  const facultyId = uuid(fd, "facultyId");
  if (!batchId || !facultyId) return missing("Batch or teacher");
  const r = await apiSend("DELETE", `/batches/${batchId}/teachers/${facultyId}`);
  if (!r.ok) return fail(r);
  revalidatePath(`/admin/batches/${batchId}`);
  return done("Removed.");
}
