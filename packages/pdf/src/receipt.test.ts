import { describe, it, expect } from "vitest";
import { formatPaise, renderReceipt } from "./receipt";

describe("receipt pdf", () => {
  it("formats paise with Indian digit grouping", () => {
    expect(formatPaise(10_000_000)).toBe("Rs. 1,00,000.00");
    expect(formatPaise(123_456)).toBe("Rs. 1,234.56");
    expect(formatPaise(0)).toBe("Rs. 0.00");
  });

  it("renders a real PDF", async () => {
    const buf = await renderReceipt({
      orgName: "Demo Academy",
      receiptNo: "RCP-2026-000001",
      receivedAt: new Date("2026-11-18T10:00:00Z"),
      studentName: "Student 1",
      rollNo: "DA-2026-001",
      method: "upi",
      reference: "ref-1",
      amountPaise: 20_000,
      invoiceTotalPaise: 50_000,
      balancePaise: 30_000,
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
