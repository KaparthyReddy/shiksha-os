export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: FieldErrors };

export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: FieldErrors }
  | { status: "success"; message: string; secret?: { label: string; value: string } };

export const idle: FormState = { status: "idle" };

export function fail(r: { message: string; fieldErrors?: FieldErrors }): FormState {
  return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
}

/** A trimmed, non-empty form value, or undefined. */
export function field(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** For PATCH: an emptied optional field means "clear it". */
export function nullable(fd: FormData, key: string): string | null {
  return field(fd, key) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids come from hidden inputs, so they are checked before being put into an API path. */
export function uuid(fd: FormData, key: string): string | undefined {
  const v = field(fd, key);
  return v && UUID.test(v) ? v : undefined;
}
