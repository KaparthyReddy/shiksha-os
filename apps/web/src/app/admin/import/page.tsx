import Link from "next/link";
import ImportWizard from "@/components/ImportWizard";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { csvDataUrl } from "@/lib/csv-out";
import type { BatchRow } from "@/lib/types";

const TEMPLATES = {
  students:
    "name,email,roll_no,guardian_name,guardian_phone,batch\r\nAsha Rao,asha.rao@example.com,2026-101,Meera Rao,9876543210,NEET 2027 - Morning\r\n",
  faculty: "name,email,designation,subjects\r\nRavi Kumar,ravi.kumar@example.com,Physics Faculty,Physics; Mathematics\r\n",
};

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "faculty" ? "faculty" : "students";
  const batches = kind === "students" ? await api<BatchRow[]>("/batches") : [];

  const tab = (k: string, label: string) => (
    <Link
      href={`/admin/import?kind=${k}`}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${kind === k ? "bg-slate-900 text-white" : "border border-slate-300 hover:bg-slate-100"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Bulk import</h1>
      <div className="flex gap-2">
        {tab("students", "Students")}
        {tab("faculty", "Faculty")}
      </div>

      <Card title="Before you start">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {kind === "students" ? (
            <>
              <li>
                Columns: <code>name</code>, <code>email</code>, <code>roll_no</code> are required.{" "}
                <code>guardian_name</code>, <code>guardian_phone</code>, <code>batch</code> are optional.
              </li>
              <li>The <code>batch</code> column takes the batch&apos;s exact name, for example <code>NEET 2027 - Morning</code>.</li>
            </>
          ) : (
            <>
              <li>
                Columns: <code>name</code> and <code>email</code> are required. <code>designation</code> and <code>subjects</code> are optional.
              </li>
              <li>Separate several subjects with a semicolon, for example <code>Physics; Mathematics</code>.</li>
            </>
          )}
          <li>In Excel or Numbers, use Save As, then CSV (UTF-8). Up to 500 rows per import.</li>
          <li>Every new account gets a random temporary password. You download them once, right after the import.</li>
        </ul>
        <a
          href={csvDataUrl(TEMPLATES[kind])}
          download={`${kind}-template.csv`}
          className="mt-4 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          Download template
        </a>
      </Card>

      <ImportWizard key={kind} kind={kind} batches={batches.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
