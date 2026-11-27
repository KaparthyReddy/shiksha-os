import { describe, it, expect } from "vitest";
import { attendedEnough, dateInZone, parseRoomName, roomName } from "./calc";

const T = "b566ae8d-ef0b-4d5c-95f4-e6cd524c2e54";
const C = "0f9a7a1e-8a3c-4c43-9e63-6a8f2d7c1b10";

describe("live class helpers", () => {
  it("round-trips room names and rejects anything else", () => {
    expect(parseRoomName(roomName(T, C))).toEqual({ tenantId: T, classId: C });
    for (const bad of ["", "lobby", `${T}`, `${T}.${C}.x`, `not-a-uuid.${C}`, `${T}.not-a-uuid`]) {
      expect(parseRoomName(bad)).toBeNull();
    }
  });
  it("decides attendance from seconds, with a boundary and a never-joined case", () => {
    expect(attendedEnough(600, 10)).toBe(true);
    expect(attendedEnough(599, 10)).toBe(false);
    expect(attendedEnough(0, 0)).toBe(true);
    expect(attendedEnough(null, 0)).toBe(false);
  });
  it("finds the calendar date in the institute's timezone", () => {
    const late = new Date("2026-11-20T20:00:00Z");
    expect(dateInZone(late, "UTC")).toBe("2026-11-20");
    expect(dateInZone(late, "Asia/Kolkata")).toBe("2026-11-21");
  });
});
