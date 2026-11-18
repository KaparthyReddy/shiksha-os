import { describe, it, expect } from "vitest";
import { classifyUse, hashToken, newRefreshToken, parseRefreshToken, REUSE_GRACE_MS } from "./tokens";

const TID = "b566ae8d-ef0b-4d5c-95f4-e6cd524c2e54";

describe("refresh tokens", () => {
  it("round-trips the tenant id and hashes deterministically", () => {
    const t = newRefreshToken(TID);
    expect(parseRefreshToken(t.raw)).toEqual({ tenantId: TID });
    expect(hashToken(t.raw)).toBe(t.hash);
    expect(newRefreshToken(TID).raw).not.toBe(t.raw);
  });
  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", "a.b", `${TID}.short`, `${TID}.${"x".repeat(30)}.extra`, `not-a-uuid.${"x".repeat(30)}`]) {
      expect(parseRefreshToken(bad)).toBeNull();
    }
  });
  it("classifies first use, grace-window reuse, and theft-style reuse", () => {
    const now = 1_000_000;
    expect(classifyUse(null, now)).toBe("fresh");
    expect(classifyUse(now - 1_000, now)).toBe("within_grace");
    expect(classifyUse(now - REUSE_GRACE_MS, now)).toBe("within_grace");
    expect(classifyUse(now - REUSE_GRACE_MS - 1, now)).toBe("reuse");
  });
});
