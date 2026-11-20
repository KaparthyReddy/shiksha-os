import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, API_URL } from "@/lib/config";
import type { ExamResults } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });

/** Free-text cells that start with = + - @ can run as formulas in Excel, so they get a leading apostrophe. */
const text = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json(404, "not_found", "Not found");
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return json(401, "unauthorized", "Sign in required");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/exams/${id}/results`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return json(502, "api_unreachable", "Can't reach the server");
  }
  if (!res.ok) {
    return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }

  const data = (await res.json()) as ExamResults;
  const pct = (score: number | null) =>
    score === null || data.maxScore <= 0 ? "" : String(Math.round((score / data.maxScore) * 1000) / 10);

  const rows = [
    ["Rank", "Roll no.", "Name", "Status", "Score", "Max score", "Percentage", "Late answers", "Submitted at"].join(","),
    ...data.results.map((r) =>
      [
        r.rank ?? "",
        text(r.rollNo),
        text(r.name),
        text(r.status),
        r.score ?? "",
        data.maxScore,
        pct(r.score),
        r.lateAnswers,
        r.submittedAt ?? "",
      ].join(","),
    ),
  ];

  return new NextResponse(rows.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="results-${id}.csv"`,
      "cache-control": "no-store",
    },
  });
}
