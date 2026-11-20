const TZ = process.env.APP_TIMEZONE ?? "Asia/Kolkata";

/** Today's date as YYYY-MM-DD in the institute's timezone. */
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const isDateStr = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
