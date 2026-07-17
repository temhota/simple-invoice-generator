import { z } from "zod";
import { invoiceSchema } from "@/lib/invoice";

export const invoiceStatuses = ["draft", "sent", "paid"] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const savedInvoiceRecordSchema = z.object({
  invoice: invoiceSchema,
  status: invoiceStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  sentAt: z.string().nullable(),
  paidAt: z.string().nullable(),
});

export type SavedInvoiceRecord = z.infer<typeof savedInvoiceRecordSchema>;

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};
