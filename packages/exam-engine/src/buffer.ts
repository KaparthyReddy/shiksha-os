import type { AnswerItem, AnswerValue } from "./types";

export interface BufferSnapshot {
  seq: Record<string, number>;
  pending: AnswerItem[];
}

/**
 * Client-side offline buffer. Keeps only the latest unsynced answer per question.
 * Persist snapshot() to localStorage/IndexedDB and restore it after a reload.
 */
export class AnswerBuffer {
  private seq = new Map<string, number>();
  private pendingByQ = new Map<string, AnswerItem>();

  constructor(
    private readonly now: () => number = Date.now,
    snapshot?: BufferSnapshot,
  ) {
    if (snapshot) {
      for (const [k, v] of Object.entries(snapshot.seq)) this.seq.set(k, v);
      for (const p of snapshot.pending) this.pendingByQ.set(p.questionId, p);
    }
  }

  record(questionId: string, response: AnswerValue, markedForReview = false): AnswerItem {
    const clientSeq = (this.seq.get(questionId) ?? 0) + 1;
    this.seq.set(questionId, clientSeq);
    const item: AnswerItem = {
      questionId,
      response,
      markedForReview,
      clientSeq,
      clientTs: Math.round(this.now()),
    };
    this.pendingByQ.set(questionId, item);
    return item;
  }

  pending(): AnswerItem[] {
    return [...this.pendingByQ.values()];
  }

  /** Clears pending entries the server has accepted (or permanently rejected). */
  ack(acked: ReadonlyArray<{ questionId: string; clientSeq: number }>): void {
    for (const a of acked) {
      const p = this.pendingByQ.get(a.questionId);
      if (p && p.clientSeq <= a.clientSeq) this.pendingByQ.delete(a.questionId);
    }
  }

  snapshot(): BufferSnapshot {
    return { seq: Object.fromEntries(this.seq), pending: this.pending() };
  }
}
