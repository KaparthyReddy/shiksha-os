"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiSend } from "@/lib/api";
import { localToIso } from "@/lib/date";
import { fail, field, uuid, type FormState } from "@/lib/form";

const problem = (message: string): FormState => ({ status: "error", message });
const success = (message: string): FormState => ({ status: "success", message });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTERS = "abcdefgh";
const TYPES = ["single_choice", "multi_choice", "numeric"] as const;
type QType = (typeof TYPES)[number];

type Parsed = { ok: true; body: Record<string, unknown> } | { ok: false; message: string };

/** Turns the question form into the API's shape. Option ids are the letters a to h. */
function parseQuestion(fd: FormData): Parsed {
  const type = field(fd, "type") as QType | undefined;
  if (!type || !TYPES.includes(type)) return { ok: false, message: "Choose a question type." };
  const subject = field(fd, "subject");
  if (!subject) return { ok: false, message: "Enter a subject." };
  const body = field(fd, "body");
  if (!body) return { ok: false, message: "Enter the question text." };

  const marks = Number(field(fd, "marks") ?? "4");
  const negativeMarks = Number(field(fd, "negativeMarks") ?? "1");
  if (!Number.isFinite(marks) || marks <= 0) return { ok: false, message: "Marks must be more than 0." };
  if (!Number.isFinite(negativeMarks) || negativeMarks < 0) {
    return { ok: false, message: "Negative marks can't be less than 0." };
  }
  const common = { subject, topic: field(fd, "topic"), type, body, marks, negativeMarks };

  if (type === "numeric") {
    const answer = field(fd, "numeric");
    if (!answer || !Number.isFinite(Number(answer))) {
      return { ok: false, message: "Enter the correct answer as a number." };
    }
    return { ok: true, body: { ...common, correct: [answer] } };
  }

  const options: { id: string; text: string }[] = [];
  for (const letter of LETTERS) {
    const text = field(fd, `opt_${letter}`);
    if (text) options.push({ id: letter, text });
  }
  if (options.length < 2) return { ok: false, message: "Add at least two options with text." };

  const ids = new Set(options.map((o) => o.id));
  const correct = fd.getAll("correct").filter((v): v is string => typeof v === "string" && ids.has(v));
  if (correct.length === 0) {
    return { ok: false, message: type === "multi_choice" ? "Mark at least one correct option." : "Mark the correct option." };
  }
  if (type === "single_choice" && correct.length !== 1) {
    return { ok: false, message: "Single choice needs exactly one correct option." };
  }
  return { ok: true, body: { ...common, options, correct } };
}

export async function createQuestionAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseQuestion(fd);
  if (!p.ok) return problem(p.message);
  const r = await apiSend("POST", "/questions", p.body);
  if (!r.ok) return fail(r);
  revalidatePath("/staff/questions");
  return success("Question added. The form is ready for the next one.");
}

export async function updateQuestionAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Question is missing. Reload the page and try again.");
  const p = parseQuestion(fd);
  if (!p.ok) return problem(p.message);
  // PUT replaces the whole question, so an emptied topic is sent as "" to clear it.
  const r = await apiSend("PUT", `/questions/${id}`, { ...p.body, topic: p.body.topic ?? "" });
  if (!r.ok) return fail(r);
  revalidatePath("/staff/questions");
  redirect("/staff/questions");
}

export async function deleteQuestionAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Question is missing. Reload the page and try again.");
  const r = await apiSend("DELETE", `/questions/${id}`);
  if (!r.ok) return fail(r);
  revalidatePath("/staff/questions");
  return success("Deleted.");
}

export async function createExamAction(_: FormState, fd: FormData): Promise<FormState> {
  const title = field(fd, "title");
  if (!title) return problem("Enter a title.");
  const durationMinutes = Number(field(fd, "durationMinutes"));
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    return problem("Duration must be a whole number of minutes between 1 and 600.");
  }
  const questionIds = fd.getAll("questionId").filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (questionIds.length === 0) return problem("Add at least one question.");

  const rawStart = field(fd, "startsAt");
  const rawEnd = field(fd, "endsAt");
  const startsAt = rawStart ? localToIso(rawStart) : null;
  const endsAt = rawEnd ? localToIso(rawEnd) : null;
  if (rawStart && !startsAt) return problem("The start time isn't valid.");
  if (rawEnd && !endsAt) return problem("The end time isn't valid.");

  const r = await apiSend<{ id: string }>("POST", "/exams", {
    title,
    durationMinutes,
    questionIds,
    batchId: uuid(fd, "batchId"),
    startsAt: startsAt ?? undefined,
    endsAt: endsAt ?? undefined,
    shuffle: field(fd, "shuffle") === "on",
  });
  if (!r.ok) return fail(r);
  revalidatePath("/staff/exams");
  redirect(`/staff/exams/${r.data.id}`);
}

export async function publishExamAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Exam is missing. Reload the page and try again.");
  const r = await apiSend("POST", `/exams/${id}/publish`);
  if (!r.ok) return fail(r);
  revalidatePath(`/staff/exams/${id}`);
  revalidatePath("/staff/exams");
  return success("Published. Students in the audience can start it now (or at the start time).");
}

export async function closeExamAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Exam is missing. Reload the page and try again.");
  const r = await apiSend("POST", `/exams/${id}/close`);
  if (!r.ok) return fail(r);
  revalidatePath(`/staff/exams/${id}`);
  revalidatePath("/staff/exams");
  return success("Closed. No new starts; students already mid-exam keep their own deadline.");
}

export async function deleteExamAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = uuid(fd, "id");
  if (!id) return problem("Exam is missing. Reload the page and try again.");
  const r = await apiSend("DELETE", `/exams/${id}`);
  if (!r.ok) return fail(r);
  revalidatePath("/staff/exams");
  redirect("/staff/exams");
}
