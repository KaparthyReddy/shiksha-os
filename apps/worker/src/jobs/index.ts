import type { Db } from "@shiksha/db";
import type { Mailer } from "../mail";
import type { JobDef } from "../scheduler";
import { sweepExams } from "./sweep";
import { sendReceipts } from "./receipts";
import { anchorAudit } from "./anchor";
import { sendOutbox } from "./outbox";

export function buildJobs(db: Db, mailer: Mailer): JobDef[] {
  return [
    { name: "exam-sweep", everyMs: 60_000, run: () => sweepExams(db) },
    { name: "receipt-emails", everyMs: 15_000, run: () => sendReceipts(db, mailer) },
    { name: "audit-anchor", everyMs: 60 * 60_000, run: () => anchorAudit(db, mailer) },
    { name: "outbox", everyMs: 10_000, run: () => sendOutbox(db, mailer) },
  ];
}
