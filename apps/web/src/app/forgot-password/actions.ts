"use server";

import { API_URL } from "@/lib/config";
import { field, type FormState } from "@/lib/form";

const problem = (message: string): FormState => ({ status: "error", message });

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const tenant = field(fd, "tenant");
  const email = field(fd, "email");
  if (!tenant || !email) return problem("Enter your institute and email address.");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant, email }),
      cache: "no-store",
    });
  } catch {
    return problem("Can't reach the server. Try again in a moment.");
  }
  if (res.status === 429) return problem("Too many requests. Wait a minute and try again.");
  if (res.status === 400) return problem("Enter a valid institute and email address.");
  if (!res.ok) return problem("Something went wrong. Try again in a moment.");

  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way. It is valid for one hour.",
  };
}
