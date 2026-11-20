import Link from "next/link";
import { notFound } from "next/navigation";
import QuestionForm from "@/components/QuestionForm";
import { Card } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { QuestionRow } from "@/lib/types";
import { updateQuestionAction } from "../../actions";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let question: QuestionRow;
  try {
    question = await api<QuestionRow>(`/questions/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/questions" className="text-sm text-slate-500 hover:underline">
          ← Question bank
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Edit question</h1>
        <p className="text-sm text-slate-500">
          A question can&apos;t be edited once students have attempted an exam that contains it, because that would change graded results.
        </p>
      </div>
      <Card className="max-w-3xl">
        <QuestionForm action={updateQuestionAction} initial={question} submitLabel="Save changes" />
      </Card>
    </div>
  );
}
