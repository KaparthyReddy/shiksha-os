import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Label, inputClass } from "@/components/ui";
import { resetPasswordAction } from "./actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        {!token ? (
          <>
            <p className="mt-4 text-sm text-slate-600">This link is missing its token. Request a fresh reset link.</p>
            <Link href="/forgot-password" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
              Request a new link
            </Link>
          </>
        ) : (
          <div className="mt-6">
            <ActionForm action={resetPasswordAction} submitLabel="Set new password">
              <input type="hidden" name="token" value={token} />
              <Label text="New password">
                <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </Label>
              <Label text="Confirm new password">
                <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </Label>
              <p className="text-xs text-slate-500">At least 8 characters. Links work once and expire after an hour.</p>
            </ActionForm>
          </div>
        )}
      </div>
    </main>
  );
}
