import Link from "next/link";
import ExamBuilder from "@/components/ExamBuilder";
import { api } from "@/lib/api";
import type { BatchRow } from "@/lib/types";
import { createExamAction } from "../../actions";

export default async function NewExamPage() {
  const batches = await api<BatchRow[]>("/batches");
  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/exams" className="text-sm text-slate-500 hover:underline">
          ← Exams
        </Link>
        <h1 className="mt-1 text-xl font-semibold">New exam</h1>
      </div>
      <ExamBuilder
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
        timezone={process.env.APP_TIMEZONE ?? "Asia/Kolkata"}
        action={createExamAction}
      />
    </div>
  );
}
