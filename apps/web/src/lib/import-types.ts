export type ImportKind = "students" | "faculty";

export interface PreviewRow {
  line: number;
  ok: boolean;
  errors: string[];
  name: string;
  email: string;
  ident: string;
  batch: string | null;
}
export interface PreviewResult {
  summary: { total: number; valid: number; invalid: number };
  ignoredColumns: string[];
  rows: PreviewRow[];
}
export interface CreatedRow {
  line: number;
  name: string;
  email: string;
  ident: string;
  temporaryPassword: string;
}
export interface SkippedRow {
  line: number;
  name: string;
  email: string;
  ident: string;
  errors: string[];
}
export interface ImportResult {
  summary: { total: number; created: number; skipped: number };
  created: CreatedRow[];
  skipped: SkippedRow[];
}
