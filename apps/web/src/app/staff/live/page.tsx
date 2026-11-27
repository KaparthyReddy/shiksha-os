import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { Badge, Card, Label, Table, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/date";
import type { BatchRow, LiveClassRow } from "@/lib/types";
import { createLiveClassAction } from "../live-actions";

export const liveTone = { scheduled: "slate", live: "green", ended: "amber", cancelled: "red" } as const;

export default async function LiveClassesPage() {
  const [classes, batches] = await Promise.all([api<LiveClassRow[]>("/live-classes"), api<BatchRow[]>("/batches")]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Live classes</h1>

      <Card title="Schedule a class">
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">You aren&apos;t assigned to any batch yet. An admin can assign you from the batch page.</p>
        ) : (
          <ActionForm action={createLiveClassAction} submitLabel="Schedule class" className="grid gap-4 sm:grid-cols-2">
            <Label text="Batch">
              <select name="batchId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Choose a batch
                </option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Title">
              <input name="title" required placeholder="Mechanics: Newton's laws" className={inputClass} />
            </Label>
            <Label text="Starts at">
              <input name="scheduledAt" type="datetime-local" required className={inputClass} />
            </Label>
            <Label text="Duration (minutes)">
              <input name="durationMinutes" type="number" min={5} max={480} defaultValue={60} required className={inputClass} />
            </Label>
          </ActionForm>
        )}
      </Card>

      <Table head={["Class", "Batch", "When", "Duration", "Status", "Joined"]}>
        {classes.length === 0 && (
          <tr>
            <td colSpan={6} className="px-4 py-6 text-slate-500">
              No classes yet.
            </td>
          </tr>
        )}
        {classes.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3 font-medium">
              <Link href={`/staff/live/${c.id}`} className="hover:underline">
                {c.title}
              </Link>
            </td>
            <td className="px-4 py-3 text-slate-600">{c.batchName}</td>
            <td className="px-4 py-3 text-xs text-slate-600">{fmtDateTime(c.scheduledAt)}</td>
            <td className="px-4 py-3">{c.durationMinutes} min</td>
            <td className="px-4 py-3">
              <Badge tone={liveTone[c.status]}>{c.status}</Badge>
            </td>
            <td className="px-4 py-3">{c.joined}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
