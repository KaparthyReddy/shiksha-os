import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE, cookieBase } from "@/lib/config";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    // Revoke server-side so a stolen copy of the cookie is dead too.
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    }).catch(() => null);
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  out.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return out;
}
