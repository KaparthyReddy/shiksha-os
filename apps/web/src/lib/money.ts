/** Parses a rupee amount typed by a person ("25000", "1,499.50", "₹500") into integer paise. */
export function parseRupees(input: string | undefined): number | null {
  if (!input) return null;
  const s = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [rupees, paise = ""] = s.split(".");
  const total = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** For prefilling an input: 150000 paise becomes "1500.00". */
export const rupeesInput = (paise: number) => (paise / 100).toFixed(2);
