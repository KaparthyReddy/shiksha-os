"use server";

import { redirect } from "next/navigation";
import { API_URL } from "@/lib/config";
import { field, type FormState } from "@/lib/form";

const problem = (message: string): FormState => ({ status: "error", message });

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = field(fd, "token");
  const next = fd.get("newPassword");
  const confirm = fd.get("confirmPassword");
  if (!token) return problem("This reset link is incomplete. Request a new one.");
  if (typeof next !== "string" || typeof confirm !== "string" || !next) return problem("Enter a new password.");
  if (next !== confirm) return problem("The two passwords don't match.");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: next }),
      cache: "no-store",
    });
  } catch {
    return problem("Can't reach the server. Try again in a moment.");
  }
  if (res.status === 429) return problem("Too many attempts. Wait a minute and try again.");
  if (res.ok) redirect("/login?reset=1");

  const data = await res.json().catch(() => null);
  return problem(data?.error?.message ?? "Couldn't reset the password.");
}
