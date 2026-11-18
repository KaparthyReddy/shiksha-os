import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, API_URL, REFRESH_COOKIE, REFRESH_MAX_AGE, cookieBase } from "@/lib/config";
import { decodeClaims } from "@/lib/jwt";

const HOME = { admin: "/admin", teacher: "/teacher", student: "/student" } as const;

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const nowSec = Math.floor(Date.now() / 1000);
  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  let refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let claims = decodeClaims(access);
  let rotated = false;
  let rejected = false;

  // Refresh when the access token is missing or about to expire.
  if ((!claims || claims.exp - nowSec < 30) && refresh) {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
        cache: "no-store",
      });
      if (r.ok) {
        const t = (await r.json()) as { accessToken: string; refreshToken: string };
        access = t.accessToken;
        refresh = t.refreshToken;
        claims = decodeClaims(access);
        rotated = true;
      } else if (r.status === 401) {
        rejected = true;
        claims = null;
      }
      // Any other failure (API down): keep what we have rather than logging the user out.
    } catch {
      /* API unreachable: same as above */
    }
  }

  const loggedIn = !!claims && claims.exp > nowSec;

  const apply = (res: NextResponse) => {
    if (rotated && access && refresh) {
      res.cookies.set(ACCESS_COOKIE, access, { ...cookieBase, maxAge: ACCESS_MAX_AGE });
      res.cookies.set(REFRESH_COOKIE, refresh, { ...cookieBase, maxAge: REFRESH_MAX_AGE });
    }
    if (rejected) {
      res.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
      res.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
    }
    return res;
  };
  const redirect = (to: string) => apply(NextResponse.redirect(new URL(to, req.url)));

  if (pathname === "/login") {
    if (loggedIn && !searchParams.has("expired")) return redirect(HOME[claims!.role]);
    return apply(NextResponse.next());
  }

  if (!loggedIn) return redirect("/login");

  const role = claims!.role;
  if (pathname === "/") return redirect(HOME[role]);
  if (pathname.startsWith("/admin") && role !== "admin") return redirect(HOME[role]);
  if (pathname.startsWith("/teacher") && role === "student") return redirect(HOME[role]);
  if (pathname.startsWith("/student") && role !== "student") return redirect(HOME[role]);

  // Server components read cookies from the incoming request, so hand them the refreshed ones.
  const headers = new Headers(req.headers);
  if (rotated && access && refresh) {
    const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
    jar.set(ACCESS_COOKIE, access);
    jar.set(REFRESH_COOKIE, refresh);
    headers.set("cookie", [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "));
  }
  return apply(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
