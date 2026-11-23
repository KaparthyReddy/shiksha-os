import PDFDocument from "pdfkit";

export interface ReceiptData {
  orgName: string;
  receiptNo: string;
  receivedAt: Date;
  studentName: string;
  rollNo: string;
  method: string;
  reference?: string | null;
  amountPaise: number;
  invoiceTotalPaise: number;
  balancePaise: number;
}

/** Built-in PDF fonts have no ₹ glyph, so amounts are written as "Rs.". Indian digit grouping. */
export function formatPaise(paise: number): string {
  return (
    "Rs. " +
    (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function renderReceipt(d: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A5",
      margin: 40,
      info: { Title: `Receipt ${d.receiptNo}`, Author: d.orgName },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const right = doc.page.width - 40;

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000").text(d.orgName, { align: "center" });
    doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#555").text("PAYMENT RECEIPT", { align: "center" });
    doc.moveDown(1.2);

    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(label, 40, y, { width: 120 });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor("#000")
        .text(value, 170, y, { width: right - 170 });
      doc.moveDown(0.7);
    };

    row("Receipt no.", d.receiptNo, true);
    row("Date", d.receivedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }));
    row("Received from", d.studentName);
    row("Roll no.", d.rollNo);
    row("Payment method", d.method.replace(/_/g, " ").toUpperCase());
    if (d.reference) row("Reference", d.reference);

    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(right, doc.y).strokeColor("#bbb").stroke();
    doc.moveDown(0.8);

    row("Amount paid", formatPaise(d.amountPaise), true);
    row("Invoice total", formatPaise(d.invoiceTotalPaise));
    row("Balance after this payment", formatPaise(d.balancePaise));

    doc.moveDown(1.5).font("Helvetica").fontSize(8).fillColor("#888")
      .text("This is a computer-generated receipt and needs no signature.", 40, doc.y, { align: "center", width: right - 40 });

    doc.end();
  });
}
