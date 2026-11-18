import { describe, it, expect } from "vitest";
import { seededShuffle, orderOptions, derivedSeed } from "./index";

describe("seededShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
  it("is deterministic for a seed", () => {
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });
  it("returns a permutation and does not mutate the input", () => {
    const copy = [...items];
    const out = seededShuffle(items, 7);
    expect([...out].sort()).toEqual([...items].sort());
    expect(items).toEqual(copy);
  });
  it("option order is stable per (seed, question)", () => {
    expect(orderOptions("q1", ["a", "b", "c", "d"], 99)).toEqual(orderOptions("q1", ["a", "b", "c", "d"], 99));
    expect(derivedSeed(1, "q1")).toBe(derivedSeed(1, "q1"));
  });
});
