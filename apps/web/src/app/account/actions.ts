"use server";

import { cookies } from "next/headers";
import { apiSend } from "@/lib/api";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, REFRESH_COOKIE, REFRESH_MAX_AGE, cookieBase } from "@/lib/config";
import { fail, type FormState } from "@/lib/form";

const problem = (message: string): FormState => ({ status: "error", message });

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const current = fd.get("currentPassword");
  const next = fd.get("newPassword");
  const confirm = fd.get("confirmPassword");
  if (typeof current !== "string" || typeof next !== "string" || typeof confirm !== "string" || !current || !next) {
    return problem("Fill in all three fields.");
  }
  if (next !== confirm) return problem("The two new passwords don't match.");

  const r = await apiSend<{ accessToken: string; refreshToken: string }>("POST", "/auth/change-password", {
    currentPassword: current,
    newPassword: next,
  });
  if (!r.ok) return fail(r);

  // The API signed out every device and issued this one a fresh session.
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, r.data.accessToken, { ...cookieBase, maxAge: ACCESS_MAX_AGE });
  jar.set(REFRESH_COOKIE, r.data.refreshToken, { ...cookieBase, maxAge: REFRESH_MAX_AGE });
  return { status: "success", message: "Password changed. Every other device has been signed out." };
}
