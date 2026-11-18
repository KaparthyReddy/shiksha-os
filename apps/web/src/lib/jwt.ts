import type { Role } from "@shiksha/shared";

export interface Claims {
  sub: string;
  tid: string;
  role: Role;
  exp: number;
}

/**
 * Reads a token's claims WITHOUT verifying the signature. That is fine here because it only
 * decides which page to show; the API verifies every token and enforces every permission.
 */
export function decodeClaims(token: string | undefined): Claims | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const p = JSON.parse(json);
    if (
      typeof p.sub !== "string" ||
      typeof p.tid !== "string" ||
      typeof p.exp !== "number" ||
      !["admin", "teacher", "student"].includes(p.role)
    ) {
      return null;
    }
    return { sub: p.sub, tid: p.tid, role: p.role as Role, exp: p.exp };
  } catch {
    return null;
  }
}
