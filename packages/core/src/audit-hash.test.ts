import { describe, it, expect } from "vitest";
import { canonical, computeHash, GENESIS_HASH } from "./audit-hash";

describe("audit hashing", () => {
  it("canonical form ignores key order and drops undefined", () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] }, u: undefined })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
  });
  it("same entry hashes the same regardless of key order", () => {
    expect(computeHash(GENESIS_HASH, { a: 1, b: 2 })).toBe(computeHash(GENESIS_HASH, { b: 2, a: 1 }));
  });
  it("changing the data or the previous hash changes the hash", () => {
    const h = computeHash(GENESIS_HASH, { a: 1 });
    expect(computeHash(GENESIS_HASH, { a: 2 })).not.toBe(h);
    expect(computeHash("f".repeat(64), { a: 1 })).not.toBe(h);
  });
});
