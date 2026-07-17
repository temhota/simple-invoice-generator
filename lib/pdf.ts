import type { Invoice } from "@/lib/invoice";
import { calculateInvoiceTotals, calculateLineTotalCents, formatMoney } from "@/lib/invoice";

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "invoice";
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const totals = calculateInvoiceTotals(invoice.items, invoice.taxRateBps);
  const left = 18;
  const right = 192;
  let y = 22;

  const line = () => {
    pdf.setDrawColor(222, 226, 230);
    pdf.line(left, y, right, y);
  };
  const text = (value: string, x: number, currentY: number, options?: { align?: "left" | "right" }) =>
    pdf.text(value || "—", x, currentY, options);

  pdf.setTextColor(23, 32, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  text("INVOICE", left, y);
  pdf.setFontSize(12);
  text(invoice.invoiceNumber, right, y, { align: "right" });
  y += 12;
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
  text(invoice.issuer.name, left, y);
  text(invoice.client.name, 108, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  y += 5;
  const issuerAddress = pdf.splitTextToSize(invoice.issuer.address || "—", 72) as string[];
  const clientAddress = pdf.splitTextToSize(invoice.client.address || "—", 72) as string[];
  pdf.text(issuerAddress, left, y);
  pdf.text(clientAddress, 108, y);
  y += Math.max(issuerAddress.length, clientAddress.length) * 4 + 4;
  text(invoice.issuer.email, left, y);
  text(invoice.client.email, 108, y);
  y += 5;
  if (invoice.issuer.taxNumber) text(`Tax no.: ${invoice.issuer.taxNumber}`, left, y);
  if (invoice.client.vatNumber) text(`VAT no.: ${invoice.client.vatNumber}`, 108, y);
  y += 5;
  if (invoice.issuer.vatNumber) text(`VAT no.: ${invoice.issuer.vatNumber}`, left, y);
  y += 8;
  text(`Work period: ${invoice.workStartDate} - ${invoice.workEndDate}`, left, y);
  text(`Due: ${invoice.dueDate}`, 108, y);
  y += 10;

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
  drawHeader();

  for (const item of invoice.items) {
    if (y > 260) {
      pdf.addPage();
      y = 22;
      drawHeader();
    }
    const description = pdf.splitTextToSize(item.description || "Line item", 82) as string[];
    pdf.text(description, left + 2, y);
    text(String(item.hours), 126, y, { align: "right" });
    text(formatMoney(item.unitPriceCents, invoice.currency), 158, y, { align: "right" });
    text(formatMoney(calculateLineTotalCents(item.hours, item.unitPriceCents), invoice.currency), right - 2, y, { align: "right" });
    y += Math.max(9, description.length * 4 + 4);
    line();
    y += 5;
  }

  if (y > 240) {
    pdf.addPage();
    y = 22;
  } else {
    y = Math.max(y + 3, 190);
  }
  const totalRow = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    text(label, 135, y);
    text(value, right, y, { align: "right" });
    y += 7;
  };
  totalRow("Subtotal", formatMoney(totals.subtotalCents, invoice.currency));
  totalRow(`VAT (${invoice.taxRateBps / 100}%)`, formatMoney(totals.taxCents, invoice.currency));
  totalRow("Total", formatMoney(totals.totalCents, invoice.currency), true);

  if (invoice.reverseCharge) {
    y += 3;
    pdf.setFont("helvetica", "bold");
    text("Reverse Charge - art. 196 VAT Directive 2006/112/CE", left, y);
    pdf.setFont("helvetica", "normal");
  }

  y += 8;
  if (y > 265) {
    pdf.addPage();
    y = 22;
  }
  pdf.setFont("helvetica", "bold");
  text("BANKING INFORMATION", left, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  text(`Account name: ${invoice.banking.accountName}`, left, y);
  y += 5;
  text(`IBAN: ${invoice.banking.iban}`, left, y);
  y += 5;
  text(`BIC: ${invoice.banking.bic}`, left, y);

  if (invoice.notes) {
    y += 8;
    pdf.setFont("helvetica", "bold");
    text("NOTES", left, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.text(pdf.splitTextToSize(invoice.notes, 170), left, y);
  }

  pdf.save(`${safeFileName(invoice.invoiceNumber)}.pdf`);
}
