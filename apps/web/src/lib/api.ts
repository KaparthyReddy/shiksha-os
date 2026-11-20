import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, API_URL } from "./config";
import type { ActionResult } from "./form";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(method: string, path: string, body?: unknown): Promise<Response | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

/** Server-side GET for pages. Throws ApiError on failure; a lapsed login redirects to /login. */
export async function api<T>(path: string): Promise<T> {
  const res = await request("GET", path);
  if (!res) throw new ApiError(502, "api_unreachable", "Can't reach the server");
  // ?expired stops the login page from bouncing a still-valid-looking cookie back here.
  if (res.status === 401) redirect("/login?expired=1");
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? res.statusText);
  }
  return data as T;
}

/** For server actions: failures come back as values so forms can show them. */
async function result<T>(method: string, path: string, body?: unknown): Promise<ActionResult<T>> {
  const res = await request(method, path, body);
  if (!res) return { ok: false, message: "Can't reach the server. Is the API running?" };
  if (res.status === 401) redirect("/login?expired=1");
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      message: data?.error?.message ?? res.statusText,
      fieldErrors: data?.error?.details?.fieldErrors,
    };
  }
  return { ok: true, data: data as T };
}

export const apiRead = <T>(path: string) => result<T>("GET", path);
export const apiSend = <T = unknown>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) =>
  result<T>(method, path, body);
