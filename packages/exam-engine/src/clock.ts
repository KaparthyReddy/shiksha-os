/** The server owns the deadline: the earlier of start+duration and the exam's hard end. */
export function computeDeadline(
  startedAtMs: number,
  durationMinutes: number,
  examEndsAtMs?: number | null,
): number {
  const byDuration = startedAtMs + durationMinutes * 60_000;
  return examEndsAtMs != null ? Math.min(byDuration, examEndsAtMs) : byDuration;
}

/**
 * Client-side estimate of server time (NTP-style). Used only for the countdown display
 * and for stamping answers. The server still enforces the real deadline.
 */
export class ClockSync {
  private offsetMs = 0;

  update(serverNowMs: number, clientSentMs: number, clientReceivedMs: number): void {
    const rtt = clientReceivedMs - clientSentMs;
    this.offsetMs = serverNowMs + rtt / 2 - clientReceivedMs;
  }

  now(localNowMs: number = Date.now()): number {
    return localNowMs + this.offsetMs;
  }

  remainingMs(deadlineMs: number, localNowMs: number = Date.now()): number {
    return Math.max(0, deadlineMs - this.now(localNowMs));
  }
}
