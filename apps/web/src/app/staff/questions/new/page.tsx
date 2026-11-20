import Link from "next/link";
import QuestionForm from "@/components/QuestionForm";
import { Card } from "@/components/ui";
import { createQuestionAction } from "../../actions";

export default function NewQuestionPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/questions" className="text-sm text-slate-500 hover:underline">
          ← Question bank
        </Link>
        <h1 className="mt-1 text-xl font-semibold">New question</h1>
      </div>
      <Card className="max-w-3xl">
        <QuestionForm action={createQuestionAction} submitLabel="Add question" resetOnSuccess />
      </Card>
    </div>
  );
}
