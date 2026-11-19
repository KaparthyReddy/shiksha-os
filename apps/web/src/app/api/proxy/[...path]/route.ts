import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// The browser can only reach these endpoints through the proxy. Everything else is a 404 here,
// and the API still enforces roles on top.
const ALLOWED: { method: string; re: RegExp }[] = [
  { method: "POST", re: new RegExp(`^exams/${ID}/start$`, "i") },
  { method: "GET", re: new RegExp(`^exam-sessions/${ID}$`, "i") },
  { method: "GET", re: new RegExp(`^exam-sessions/${ID}/time$`, "i") },
  { method: "POST", re: new RegExp(`^exam-sessions/${ID}/answers$`, "i") },
  { method: "POST", re: new RegExp(`^exam-sessions/${ID}/submit$`, "i") },
];

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED.some((a) => a.method === req.method && a.re.test(joined))) {
    return json(404, "not_found", "Not found");
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return json(401, "unauthorized", "Sign in required");

  const body = req.method === "GET" ? undefined : await req.text();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/${joined}`, {
      method: req.method,
      headers,
      body: body || undefined,
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

export const GET = handle;
export const POST = handle;
