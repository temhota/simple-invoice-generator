import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultInvoice } from "./invoice";
import { downloadInvoicePdf } from "./pdf";

const { draws } = vi.hoisted(() => ({
  draws: [] as {
    text: string;
    x: number;
    y: number;
    width: number;
    page: number;
  }[],
}));

// Keep jsPDF's real font metrics, wrapping, and document construction; replace
// only the browser download and observe the text sent to the document.
vi.mock("jspdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jspdf")>();
  return {
    ...actual,
    jsPDF: function (options: ConstructorParameters<typeof actual.jsPDF>[0]) {
      const pdf = new actual.jsPDF(options);
      const original = pdf.text.bind(pdf);
      pdf.text = ((
        value: string | string[],
        x: number,
        y: number,
        options?: { align?: "left" | "right" | "center" | "justify" },
      ) => {
        const step =
          (pdf.getFontSize() * pdf.getLineHeightFactor()) /
          pdf.internal.scaleFactor;
        (Array.isArray(value) ? value : value.split("\n")).forEach(
          (text, index) => {
            const width = pdf.getTextWidth(text);
            draws.push({
              text,
              x: options?.align === "right" ? x - width : x,
              y: y + index * step,
              width,
              page: pdf.getNumberOfPages(),
            });
          },
        );
        return original(value, x, y, options);
      }) as typeof pdf.text;
      pdf.save = (() => pdf) as typeof pdf.save;
      return pdf;
    },
  };
});

function expectWithinPage() {
  for (const draw of draws) {
    expect(draw.y, `Off-page text: ${draw.text}`).toBeLessThanOrEqual(279);
    expect(draw.x, `Left overflow: ${draw.text}`).toBeGreaterThanOrEqual(17.5);
    expect(
      draw.x + draw.width,
      `Right overflow: ${draw.text}`,
    ).toBeLessThanOrEqual(192.5);
  }
}

beforeEach(() => draws.splice(0));

describe("PDF pagination", () => {
  it("splits a description across pages and repeats the table header without losing lines", async () => {
    const invoice = createDefaultInvoice();
    invoice.items[0].description = Array.from(
      { length: 150 },
      (_, i) => `Description line ${i}`,
    ).join("\n");
    await downloadInvoicePdf(invoice);
    expectWithinPage();
    const rows = draws.filter((draw) =>
      draw.text.startsWith("Description line"),
    );
    expect(rows).toHaveLength(150);
    expect(rows[0].page).toBe(1);
    expect(new Set(rows.map((row) => row.page)).size).toBeGreaterThan(1);
    for (const page of new Set(rows.map((row) => row.page))) {
      expect(
        draws.some((draw) => draw.page === page && draw.text === "DESCRIPTION"),
      ).toBe(true);
    }
  });

  it("paginates multiline notes even when each line is short", async () => {
    const invoice = createDefaultInvoice();
    invoice.notes = Array.from({ length: 100 }, () => "note").join("\n");
    await downloadInvoicePdf(invoice);
    expectWithinPage();
    expect(draws.filter((draw) => draw.text === "note")).toHaveLength(100);
  });

  it("wraps and paginates long invoice identifiers, party details and bank account names", async () => {
    const invoice = createDefaultInvoice();
    invoice.invoiceNumber = "INV".repeat(100);
    invoice.issuer.name = "Long company name ".repeat(40);
    invoice.client.email = `${"email".repeat(40)}@example.com`;
    invoice.issuer.address = Array.from(
      { length: 100 },
      () => "Address line",
    ).join("\n");
    invoice.banking.accountName = "Long bank account name ".repeat(100);
    await downloadInvoicePdf(invoice);
    expectWithinPage();
    expect(draws.filter((draw) => draw.text === "Address line")).toHaveLength(
      100,
    );
  });
});
