import { describe, it, expect } from "vitest";
import { passwordProblem } from "./password-policy";

describe("passwordProblem", () => {
  it("accepts ordinary passwords, including the demo one", () => {
    expect(passwordProblem("demo1234")).toBeNull();
    expect(passwordProblem("correct horse battery")).toBeNull();
  });
  it("rejects short, long, common and repeated-character passwords", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/);
    expect(passwordProblem("x".repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem("Password123")).toMatch(/too common/);
    expect(passwordProblem("aaaaaaaaaa")).toMatch(/repeated/);
  });
  it("rejects a password equal to the email", () => {
    expect(passwordProblem("Asha@Example.com", "asha@example.com")).toMatch(/email/);
  });
});
