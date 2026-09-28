import type { Invoice } from "@/lib/invoice";
import {
  calculateInvoiceTotals,
  calculateLineTotalCents,
  formatMoney,
} from "@/lib/invoice";

function safeFileName(value: string): string {
  return (
    value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "invoice"
  );
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const totals = calculateInvoiceTotals(invoice.items, invoice.taxRateBps);
  const left = 18;
  const right = 192;
  let y = 22;

  const bottom = 279;
  const lineHeight = 4.5;
  const line = () => {
    pdf.setDrawColor(222, 226, 230);
    pdf.line(left, y, right, y);
  };
  const text = (
    value: string,
    x: number,
    currentY: number,
    options?: { align?: "left" | "right" },
  ) => pdf.text(value || "—", x, currentY, options);
  const newPage = () => {
    const font = pdf.getFont();
    const size = pdf.getFontSize();
    pdf.addPage();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    text("INVOICE (continued)", left, 18);
    pdf.setFont(font.fontName, font.fontStyle);
    pdf.setFontSize(size);
    y = 30;
  };
  const ensureSpace = (height = 0) => {
    if (y + height > bottom) newPage();
  };
  const wrapped = (value: string, width: number) =>
    pdf.splitTextToSize(value || "—", width) as string[];
  // Draw each baseline explicitly: jsPDF's default array spacing changes with
  // font size and must not be used to estimate available page space.
  const paragraph = (value: string, x = left, width = right - left) => {
    for (const row of wrapped(value, width)) {
      ensureSpace();
      text(row, x, y);
      y += lineHeight;
    }
  };
  const columns = (first: string, second: string, width = 78) => {
    const a = wrapped(first, width);
    const b = wrapped(second, width);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      ensureSpace();
      if (i < a.length) text(a[i], left, y);
      if (i < b.length) text(b[i], 108, y);
      y += lineHeight;
    }
  };

  pdf.setTextColor(23, 32, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  text("INVOICE", left, y);
  pdf.setFontSize(12);
  for (const row of wrapped(invoice.invoiceNumber, 80)) {
    ensureSpace();
    text(row, right, y, { align: "right" });
    y += 6;
  }
  y += 6;
  ensureSpace(15);
  line();
  y += 9;

  pdf.setFontSize(9);
  pdf.setTextColor(103, 113, 123);
  text("FROM", left, y);
  text("BILL TO", 108, y);
  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(23, 32, 42);
  pdf.setFontSize(11);
  columns(invoice.issuer.name, invoice.client.name);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  y += 1;
  columns(invoice.issuer.address, invoice.client.address);
  y += 4;
  columns(invoice.issuer.email, invoice.client.email);
  columns(
    invoice.issuer.taxNumber ? `Tax no.: ${invoice.issuer.taxNumber}` : "",
    invoice.client.vatNumber ? `VAT no.: ${invoice.client.vatNumber}` : "",
  );
  if (invoice.issuer.vatNumber)
    paragraph(`VAT no.: ${invoice.issuer.vatNumber}`, left, 78);
  y += 8;
  columns(
    `Work period: ${invoice.workStartDate} - ${invoice.workEndDate}`,
    `Due: ${invoice.dueDate}`,
  );
  y += 6;

  const drawHeader = () => {
    pdf.setFillColor(244, 246, 248);
    pdf.rect(left, y - 5, right - left, 9, "F");
    pdf.setFont("helvetica", "bold");
    text("DESCRIPTION", left + 2, y);
    text("HOURS", 126, y, { align: "right" });
    text("RATE", 158, y, { align: "right" });
    text("AMOUNT", right - 2, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 9;
  };
  ensureSpace(18);
  drawHeader();

  for (const item of invoice.items) {
    const description = wrapped(item.description || "Line item", 82);
    // Move ordinary rows together; exceptionally tall rows flow onto as many
    // pages as needed, with the monetary values shown only once.
    const rowHeight = Math.max(9, description.length * lineHeight + 4);
    if (
      y + lineHeight > bottom ||
      (rowHeight <= bottom - 39 && y + rowHeight > bottom)
    ) {
      newPage();
      drawHeader();
    }
    text(String(item.hours), 126, y, { align: "right" });
    text(formatMoney(item.unitPriceCents, invoice.currency), 158, y, {
      align: "right",
    });
    text(
      formatMoney(
        calculateLineTotalCents(item.hours, item.unitPriceCents),
        invoice.currency,
      ),
      right - 2,
      y,
      { align: "right" },
    );
    for (const row of description) {
      if (y + lineHeight > bottom) {
        newPage();
        drawHeader();
      }
      text(row, left + 2, y);
      y += lineHeight;
    }
    y += Math.max(4, 9 - description.length * lineHeight);
    // Separators are decorative; skip one at a page boundary instead of
    // creating a page containing only a rule.
    if (y <= bottom) line();
    y += 5;
  }

  if (y + 24 > bottom) newPage();
  else y = Math.max(y + 3, 190);
  const totalRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    text(label, 135, y);
    text(value, right, y, { align: "right" });
    y += 7;
  };
  totalRow("Subtotal", formatMoney(totals.subtotalCents, invoice.currency));
  totalRow(
    `VAT (${invoice.taxRateBps / 100}%)`,
    formatMoney(totals.taxCents, invoice.currency),
  );
  totalRow("Total", formatMoney(totals.totalCents, invoice.currency), true);

  if (invoice.reverseCharge) {
    y += 3;
    pdf.setFont("helvetica", "bold");
    paragraph("Reverse Charge - art. 196 VAT Directive 2006/112/CE");
    pdf.setFont("helvetica", "normal");
  }

  y += 8;
  ensureSpace(12);
  pdf.setFont("helvetica", "bold");
  text("BANKING INFORMATION", left, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  paragraph(`Account name: ${invoice.banking.accountName}`);
  paragraph(`IBAN: ${invoice.banking.iban}`);
  paragraph(`BIC: ${invoice.banking.bic}`);

  if (invoice.notes) {
    y += 8;
    ensureSpace(10);
    pdf.setFont("helvetica", "bold");
    text("NOTES", left, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    paragraph(invoice.notes);
  }

  pdf.save(`${safeFileName(invoice.invoiceNumber)}.pdf`);
}
