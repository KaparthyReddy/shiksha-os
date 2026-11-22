import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";
import { decodeClaims } from "@/lib/jwt";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

/** Students get their own report card; staff pass ?studentId=... (and an optional ?remark=...). */
export async function GET(req: Request) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const claims = decodeClaims(token);
  if (!token || !claims) return json(401, "unauthorized", "Sign in required");

  const sp = new URL(req.url).searchParams;
  let path: string;
  if (claims.role === "student") {
    path = "/me/report-card.pdf";
  } else {
    const id = sp.get("studentId");
    if (!id || !UUID.test(id)) return json(400, "bad_request", "Choose a student.");
    path = `/students/${id}/report-card.pdf`;
    const remark = sp.get("remark")?.trim();
    if (remark) path += `?remark=${encodeURIComponent(remark.slice(0, 300))}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    return json(502, "api_unreachable", "Can't reach the server");
  }
  if (!res.ok) {
    return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="report-card.pdf"',
      "cache-control": "no-store",
    },
  });
}
