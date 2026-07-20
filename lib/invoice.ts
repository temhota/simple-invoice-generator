import { z } from "zod";

export const currencies = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof currencies)[number];

const partySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
  address: z.string().trim().min(1, "Address is required"),
});

const issuerSchema = partySchema.extend({
  taxNumber: z.string().trim().max(40, "Keep tax number under 40 characters"),
  vatNumber: z.string().trim().max(40, "Keep VAT number under 40 characters"),
});

const clientSchema = partySchema.extend({
  vatNumber: z.string().trim().max(40, "Keep VAT number under 40 characters"),
});

const bankingSchema = z.object({
  accountName: z.string().trim().min(1, "Name is required"),
  iban: z
    .string()
    .trim()
    .min(1, "IBAN is required")
    .max(42, "Enter a valid IBAN"),
  bic: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/, "BIC must contain 8 or 11 characters"),
});

const lineItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(1, "Description is required"),
  hours: z
    .number()
    .min(0.25, "Minimum time is 0.25 hours")
    .max(9999)
    .multipleOf(0.25, "Use 0.25-hour increments"),
  unitPriceCents: z.number().int().min(0, "Price cannot be negative").max(999_999_999),
});

export const invoiceSchema = z
  .object({
    id: z.string().min(1),
    invoiceNumber: z.string().trim().min(1, "Invoice number is required"),
    workStartDate: z.string().date("Enter a valid start date"),
    workEndDate: z.string().date("Enter a valid end date"),
    dueDate: z.string().date("Enter a valid due date"),
    currency: z.enum(currencies),
    issuer: issuerSchema,
    client: clientSchema,
    banking: bankingSchema,
    items: z.array(lineItemSchema).min(1, "Add at least one item").max(50),
    taxRateBps: z.union([z.literal(0), z.literal(1900)]),
    reverseCharge: z.boolean(),
    notes: z.string().max(500, "Keep notes under 500 characters"),
  })
  .refine((value) => value.workEndDate >= value.workStartDate, {
    message: "End date cannot be before start date",
    path: ["workEndDate"],
  })
  .refine((value) => value.dueDate >= value.workEndDate, {
    message: "Due date cannot be before the work period ends",
    path: ["dueDate"],
  })
  .refine((value) => !value.reverseCharge || value.taxRateBps === 0, {
    message: "Reverse charge requires a 0% VAT rate",
    path: ["taxRateBps"],
  });

export type Invoice = z.infer<typeof invoiceSchema>;

// A recovery snapshot may be incomplete, but its persisted shape must remain safe to load.
export const invoiceRecoverySchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  workStartDate: z.string(),
  workEndDate: z.string(),
  dueDate: z.string(),
  currency: z.enum(currencies),
  issuer: z.object({
    name: z.string(),
    email: z.string(),
    address: z.string(),
    taxNumber: z.string(),
    vatNumber: z.string(),
  }),
  client: z.object({ name: z.string(), email: z.string(), address: z.string(), vatNumber: z.string() }),
  banking: z.object({ accountName: z.string(), iban: z.string(), bic: z.string() }),
  items: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      hours: z.number(),
      unitPriceCents: z.number().int(),
    }),
  ),
  taxRateBps: z.union([z.literal(0), z.literal(1900)]),
  reverseCharge: z.boolean(),
  notes: z.string(),
});

export type InvoiceTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export function calculateInvoiceTotals(
  items: Pick<Invoice["items"][number], "hours" | "unitPriceCents">[],
  taxRateBps: number,
): InvoiceTotals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + calculateLineTotalCents(item.hours, item.unitPriceCents),
    0,
  );
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function calculateLineTotalCents(hours: number, hourlyRateCents: number): number {
  return Math.round(hours * hourlyRateCents);
}

export function formatMoney(cents: number, currency: Currency): string {
  const parts = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).formatToParts(cents / 100);
  return parts
    .map((part, index) => {
      if (part.type !== "currency") return part.value;
      const nextPart = parts[index + 1];
      return nextPart?.type === "integer" ? `${part.value} ` : part.value;
    })
    .join("");
}

export function centsFromInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d*(?:\.\d{0,2})?$/.test(normalized) || normalized === "") return null;
  const [major = "0", minor = ""] = normalized.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createDefaultInvoice(): Invoice {
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 14);
  const date = (value: Date) => value.toISOString().slice(0, 10);

  return {
    id: makeId(),
    invoiceNumber: `INV-${today.getFullYear()}-001`,
    workStartDate: date(today),
    workEndDate: date(today),
    dueDate: date(due),
    currency: "EUR",
    issuer: { name: "", email: "", address: "", taxNumber: "", vatNumber: "" },
    client: { name: "", email: "", address: "", vatNumber: "" },
    banking: { accountName: "", iban: "", bic: "" },
    items: [{ id: makeId(), description: "", hours: 1, unitPriceCents: 0 }],
    taxRateBps: 0,
    reverseCharge: false,
    notes: "",
  };
}
