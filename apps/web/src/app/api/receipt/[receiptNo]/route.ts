import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";
import { decodeClaims } from "@/lib/jwt";

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

export async function GET(_: Request, ctx: { params: Promise<{ receiptNo: string }> }) {
  const { receiptNo } = await ctx.params;
  if (!/^RCP-\d{4}-\d{6,}$/.test(receiptNo)) return json(404, "not_found", "Receipt not found");

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const claims = decodeClaims(token);
  if (!token || !claims) return json(401, "unauthorized", "Sign in required");

  const path = claims.role === "student" ? `/me/receipts/${receiptNo}/pdf` : `/receipts/${receiptNo}/pdf`;
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
      "content-disposition": res.headers.get("content-disposition") ?? `attachment; filename="${receiptNo}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
