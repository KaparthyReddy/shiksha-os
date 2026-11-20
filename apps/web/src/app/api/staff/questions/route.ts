import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

/** Search proxy for the exam builder. The API enforces the staff-only rule. */
export async function GET(req: Request) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return json(401, "unauthorized", "Sign in required");

  const src = new URL(req.url).searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "subject", "topic"]) {
    const v = src.get(key)?.trim();
    if (v) params.set(key, v.slice(0, 100));
  }
  params.set("page", String(Math.max(1, Number(src.get("page")) || 1)));
  params.set("pageSize", "20");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/questions?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return json(502, "api_unreachable", "Can't reach the server");
  }
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
