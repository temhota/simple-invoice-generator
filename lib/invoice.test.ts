import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, centsFromInput, createDefaultInvoice, formatMoney, invoiceSchema } from "./invoice";

describe("calculateInvoiceTotals", () => {
  it("keeps all monetary calculations in integer cents", () => {
    expect(
      calculateInvoiceTotals(
        [
          { hours: 2, unitPriceCents: 1_250 },
          { hours: 1, unitPriceCents: 499 },
        ],
        1_900,
      ),
    ).toEqual({ subtotalCents: 2_999, taxCents: 570, totalCents: 3_569 });
  });

  it("rounds tax to the nearest cent", () => {
    expect(calculateInvoiceTotals([{ hours: 1, unitPriceCents: 101 }], 500).taxCents).toBe(5);
  });

  it("supports quarter-hour work and rounds the line amount to cents", () => {
    expect(calculateInvoiceTotals([{ hours: 1.25, unitPriceCents: 3_333 }], 0)).toEqual({
      subtotalCents: 4_166,
      taxCents: 0,
      totalCents: 4_166,
    });
  });
});

describe("centsFromInput", () => {
  it.each([
    ["12", 1_200],
    ["12.3", 1_230],
    ["12,34", 1_234],
    ["0.01", 1],
  ])("parses %s", (input, expected) => expect(centsFromInput(input)).toBe(expected));

  it.each(["-1", "1.234", "hello", ""])("rejects %s", (input) => {
    expect(centsFromInput(input)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("keeps a visible space between the currency symbol and amount", () => {
    expect(formatMoney(12_345, "EUR")).toBe("€ 123.45");
  });
});

describe("invoiceSchema", () => {
  it("rejects a due date before the work period ends", () => {
    const result = invoiceSchema.safeParse({
      id: "invoice-1",
      invoiceNumber: "INV-1",
      workStartDate: "2026-07-14",
      workEndDate: "2026-07-16",
      dueDate: "2026-07-15",
      currency: "EUR",
      issuer: { name: "Studio", email: "", address: "Berlin", taxNumber: "", vatNumber: "" },
      client: { name: "Client", email: "", address: "Paris", vatNumber: "" },
      banking: { accountName: "Studio", iban: "DE02120300000000202051", bic: "BYLADEM1001" },
      items: [{ id: "item-1", description: "Design", hours: 1, unitPriceCents: 100 }],
      taxRateBps: 0,
      reverseCharge: false,
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a work period whose end precedes its start", () => {
    const result = invoiceSchema.safeParse({
      id: "invoice-1",
      invoiceNumber: "INV-1",
      workStartDate: "2026-07-16",
      workEndDate: "2026-07-15",
      dueDate: "2026-07-30",
      currency: "EUR",
      issuer: { name: "Studio", email: "", address: "Berlin", taxNumber: "", vatNumber: "" },
      client: { name: "Client", email: "", address: "Paris", vatNumber: "" },
      banking: { accountName: "Studio", iban: "DE02120300000000202051", bic: "BYLADEM1001" },
      items: [{ id: "item-1", description: "Design", hours: 1, unitPriceCents: 100 }],
      taxRateBps: 0,
      reverseCharge: false,
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts only 0% or 19% tax", () => {
    const baseInvoice = {
      id: "invoice-1",
      invoiceNumber: "INV-1",
      workStartDate: "2026-07-15",
      workEndDate: "2026-07-16",
      dueDate: "2026-07-30",
      currency: "EUR",
      issuer: { name: "Studio", email: "", address: "Berlin", taxNumber: "", vatNumber: "" },
      client: { name: "Client", email: "", address: "Paris", vatNumber: "" },
      banking: { accountName: "Studio", iban: "DE02120300000000202051", bic: "BYLADEM1001" },
      items: [{ id: "item-1", description: "Design", hours: 1, unitPriceCents: 100 }],
      notes: "",
      reverseCharge: false,
    };

    expect(invoiceSchema.safeParse({ ...baseInvoice, taxRateBps: 0 }).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...baseInvoice, taxRateBps: 1900 }).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...baseInvoice, taxRateBps: 700 }).success).toBe(false);
  });

  it("requires 0% VAT when reverse charge is enabled", () => {
    const invoice = createDefaultInvoice();
    invoice.issuer = { name: "Studio", email: "", address: "Berlin", taxNumber: "", vatNumber: "" };
    invoice.client = { name: "Client", email: "", address: "Paris", vatNumber: "FR123" };
    invoice.banking = { accountName: "Studio", iban: "DE02120300000000202051", bic: "BYLADEM1001" };
    invoice.items = [{ id: "item-1", description: "Design", hours: 1, unitPriceCents: 100 }];
    invoice.reverseCharge = true;

    expect(invoiceSchema.safeParse({ ...invoice, taxRateBps: 0 }).success).toBe(true);
    expect(invoiceSchema.safeParse({ ...invoice, taxRateBps: 1900 }).success).toBe(false);
  });
});
