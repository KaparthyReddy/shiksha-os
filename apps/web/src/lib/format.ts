/** Amounts are stored as integer paise (₹1 = 100). */
export const inr = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
