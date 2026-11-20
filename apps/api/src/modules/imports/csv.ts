export class CsvError extends Error {}

export const MAX_ROWS = 500;

/** canonical column name -> other header spellings that mean the same thing */
export type Aliases = Record<string, string[]>;

export interface CsvRow {
  /** 1-based line in the file where this row starts (the header is line 1). */
  line: number;
  values: Record<string, string>;
  tooManyColumns: boolean;
}

export interface ParsedCsv {
  delimiter: string;
  columns: string[];
  ignoredColumns: string[];
  rows: CsvRow[];
}

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[\s\-.]+/g, "_").replace(/^_+|_+$/g, "");

/** Excel in some locales saves with semicolons, so pick whichever separator the header line uses most. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t"]) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

interface RawRecord {
  fields: string[];
  line: number;
}

function splitRecords(text: string, delim: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push({ fields, line: recordLine });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (c === delim) {
      endField();
      continue;
    }
    if (c === "\r" && text[i + 1] === "\n") continue;
    if (c === "\n" || c === "\r") {
      endRecord();
      line++;
      recordLine = line;
      continue;
    }
    field += c;
  }
  if (inQuotes) throw new CsvError("A quoted value is never closed. Check for a stray double quote.");
  if (field !== "" || fields.length > 0) endRecord();
  return records;
}

export function parseCsv(input: string, aliases: Aliases): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  if (text.trim() === "") throw new CsvError("The file is empty.");

  const delimiter = detectDelimiter(text);
  const records = splitRecords(text, delimiter).filter(
    (r) => !(r.fields.length === 1 && r.fields[0]!.trim() === ""),
  );
  const head = records[0];
  if (!head) throw new CsvError("The file is empty.");
  const body = records.slice(1);

  const lookup = new Map<string, string>();
  for (const [canonical, names] of Object.entries(aliases)) {
    lookup.set(normalizeHeader(canonical), canonical);
    for (const n of names) lookup.set(normalizeHeader(n), canonical);
  }

  const columns = head.fields.map((h) => lookup.get(normalizeHeader(h)) ?? null);
  const ignoredColumns = head.fields.filter((_, i) => columns[i] === null).map((h) => h.trim()).filter(Boolean);

  const seen = new Set<string>();
  for (const c of columns) {
    if (!c) continue;
    if (seen.has(c)) throw new CsvError(`The column "${c}" appears more than once.`);
    seen.add(c);
  }

  if (body.length === 0) throw new CsvError("The file has a header but no rows.");
  if (body.length > MAX_ROWS) {
    throw new CsvError(`Too many rows: ${body.length}. Import at most ${MAX_ROWS} at a time.`);
  }

  const rows: CsvRow[] = body.map((rec) => {
    const values: Record<string, string> = {};
    columns.forEach((c, i) => {
      if (c) values[c] = (rec.fields[i] ?? "").trim();
    });
    const extra = rec.fields.slice(columns.length).some((f) => f.trim() !== "");
    return { line: rec.line, values, tooManyColumns: extra };
  });

  return { delimiter, columns: [...seen], ignoredColumns, rows };
}
