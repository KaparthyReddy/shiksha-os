import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Server-side fetch to the API with the caller's access token. Middleware keeps that token fresh. */
export async function api<T>(path: string): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  // ?expired stops the login page from bouncing a still-valid-looking cookie back here.
  if (res.status === 401) redirect("/login?expired=1");
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? res.statusText);
  }
  return body as T;
}
