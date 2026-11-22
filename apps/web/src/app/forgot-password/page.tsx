import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Label, inputClass } from "@/components/ui";
import { forgotPasswordAction } from "./actions";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">We&apos;ll email you a link to choose a new one.</p>
        <div className="mt-6">
          <ActionForm action={forgotPasswordAction} submitLabel="Send reset link">
            <Label text="Institute">
              <input name="tenant" defaultValue="demo-academy" required className={inputClass} />
            </Label>
            <Label text="Email">
              <input name="email" type="email" required autoComplete="username" className={inputClass} />
            </Label>
          </ActionForm>
        </div>
        <Link href="/login" className="mt-6 inline-block text-sm text-slate-500 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
