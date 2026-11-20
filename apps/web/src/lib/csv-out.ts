/** One CSV cell. Text starting with = + - @ would run as a formula in Excel, so it gets a leading apostrophe. */
export function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const csvLine = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(",");

export const csvDataUrl = (csv: string) => `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
