const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROOM_RE = new RegExp(`^(${UUID})\\.(${UUID})$`, "i");

/** Rooms are named tenant.class, so a webhook can find the right institute without trusting anything else. */
export const roomName = (tenantId: string, classId: string) => `${tenantId}.${classId}`;

export function parseRoomName(name: string): { tenantId: string; classId: string } | null {
  const m = ROOM_RE.exec(name);
  return m ? { tenantId: m[1]!, classId: m[2]! } : null;
}

/** null means the person never joined. With minMinutes 0, any join counts. */
export function attendedEnough(totalSeconds: number | null, minMinutes: number): boolean {
  return totalSeconds !== null && totalSeconds >= minMinutes * 60;
}

/** The calendar date (YYYY-MM-DD) an instant falls on in the institute's timezone. */
export function dateInZone(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
