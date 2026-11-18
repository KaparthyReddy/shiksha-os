import { describe, it, expect } from "vitest";
import { likeTerm, pgCode, rethrowUnique } from "./http";
import { AppError } from "./errors";

describe("http helpers", () => {
  it("likeTerm escapes wildcard characters", () => {
    expect(likeTerm("50%_a")).toBe("%50\\%\\_a%");
    expect(likeTerm("plain")).toBe("%plain%");
  });
  it("pgCode reads direct and wrapped driver errors", () => {
    expect(pgCode({ code: "23505" })).toBe("23505");
    expect(pgCode({ cause: { code: "23503" } })).toBe("23503");
    expect(pgCode(new Error("x"))).toBeUndefined();
  });
  it("rethrowUnique maps 23505 to a 409 and passes other errors through", () => {
    try {
      rethrowUnique({ code: "23505" }, "dup");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(409);
    }
    const other = new Error("boom");
    expect(() => rethrowUnique(other, "dup")).toThrow(other);
  });
});
