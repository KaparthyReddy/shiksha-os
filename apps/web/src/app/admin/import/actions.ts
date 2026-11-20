"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";
import type { ActionResult } from "@/lib/form";
import type { ImportKind, ImportResult, PreviewResult } from "@/lib/import-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bad = (message: string): ActionResult<never> => ({ ok: false, message });

function check(kind: string, csv: string, batchId: string | null) {
  if (kind !== "students" && kind !== "faculty") return bad("Unknown import type.");
  if (!csv.trim()) return bad("The file is empty.");
  if (csv.length > 800_000) return bad("The file is too large. Split it into files of 500 rows or fewer.");
  if (batchId && !UUID.test(batchId)) return bad("That batch isn't valid.");
  return null;
}

export async function previewImportAction(
  kind: ImportKind,
  csv: string,
  batchId: string | null,
): Promise<ActionResult<PreviewResult>> {
  const problem = check(kind, csv, batchId);
  if (problem) return problem;
  return apiSend<PreviewResult>("POST", `/imports/${kind}/preview`, { csv, batchId: batchId ?? undefined });
}

export async function runImportAction(
  kind: ImportKind,
  csv: string,
  batchId: string | null,
): Promise<ActionResult<ImportResult>> {
  const problem = check(kind, csv, batchId);
  if (problem) return problem;
  const r = await apiSend<ImportResult>("POST", `/imports/${kind}`, { csv, batchId: batchId ?? undefined });
  if (r.ok) {
    revalidatePath("/admin");
    revalidatePath("/admin/students");
    revalidatePath("/admin/faculty");
    revalidatePath("/admin/batches");
  }
  return r;
}
