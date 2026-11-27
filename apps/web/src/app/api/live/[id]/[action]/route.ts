import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["join", "end"]);

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

/** Lets the browser join or end a live class without ever seeing the app's own access token. */
export async function POST(_: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  if (!UUID.test(id) || !ACTIONS.has(action)) return json(404, "not_found", "Not found");

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return json(401, "unauthorized", "Sign in required");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/live-classes/${id}/${action}`, {
      method: "POST",
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
