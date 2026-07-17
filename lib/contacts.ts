import { z } from "zod";

const optionalEmail = z.string().trim().email("Enter a valid email").or(z.literal(""));

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: optionalEmail,
  address: z.string().trim().min(1, "Address is required"),
  taxNumber: z.string().trim().max(40),
  vatNumber: z.string().trim().max(40),
  iban: z.string().trim().min(1, "IBAN is required").max(42),
  bic: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{3})?$/, "BIC must contain 8 or 11 characters"),
});

export const clientInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Client name is required"),
  email: optionalEmail,
  address: z.string().trim().min(1, "Address is required"),
  vatNumber: z.string().trim().max(40),
});

export const clientRecordSchema = clientInputSchema.extend({
  id: z.string().uuid(),
  updatedAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;
export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientRecord = z.infer<typeof clientRecordSchema>;
