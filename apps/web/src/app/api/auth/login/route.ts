import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, API_URL, REFRESH_COOKIE, REFRESH_MAX_AGE, cookieBase } from "@/lib/config";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "Can't reach the server. Is the API running?" } },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      data ?? { error: { code: "error", message: "Sign-in failed" } },
      { status: res.status },
    );
  }

  // Tokens go into httpOnly cookies and are never returned to page scripts.
  const out = NextResponse.json({ user: data.user, tenant: data.tenant });
  out.cookies.set(ACCESS_COOKIE, data.accessToken, { ...cookieBase, maxAge: ACCESS_MAX_AGE });
  out.cookies.set(REFRESH_COOKIE, data.refreshToken, { ...cookieBase, maxAge: REFRESH_MAX_AGE });
  return out;
}
