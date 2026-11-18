import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

/** Stable JSON: object keys sorted, undefined dropped. Same data always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  const body = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",");
  return `{${body}}`;
}

export function computeHash(prevHash: string, entry: unknown): string {
  return createHash("sha256").update(prevHash + canonical(entry)).digest("hex");
}
