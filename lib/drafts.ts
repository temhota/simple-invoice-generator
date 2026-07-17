import { invoiceDraftSchema, type Invoice } from "@/lib/invoice";

const STORAGE_KEY = "simple-invoice-drafts-v1";

export type SavedDraft = {
  invoice: Invoice;
  updatedAt: string;
};

export function readDrafts(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as { invoice?: unknown; updatedAt?: unknown };
      const rawInvoice = candidate.invoice;
      if (!rawInvoice || typeof rawInvoice !== "object") return [];
      const legacy = rawInvoice as Record<string, unknown>;
      const legacyIssuer =
        legacy.issuer && typeof legacy.issuer === "object"
          ? (legacy.issuer as Record<string, unknown>)
          : {};
      const legacyClient =
        legacy.client && typeof legacy.client === "object"
          ? (legacy.client as Record<string, unknown>)
          : {};
      const migrated = {
        ...legacy,
        workStartDate: legacy.workStartDate ?? legacy.issueDate ?? "",
        workEndDate: legacy.workEndDate ?? legacy.issueDate ?? "",
        issuer: {
          ...legacyIssuer,
          taxNumber: legacyIssuer.taxNumber ?? "",
          vatNumber: legacyIssuer.vatNumber ?? "",
        },
        client: {
          ...legacyClient,
          vatNumber: legacyClient.vatNumber ?? "",
        },
        banking: legacy.banking ?? { accountName: "", iban: "", bic: "" },
        taxRateBps: legacy.taxRateBps === 1900 ? 1900 : 0,
        reverseCharge: legacy.reverseCharge === true,
        items: Array.isArray(legacy.items)
          ? legacy.items.map((item) => {
              if (!item || typeof item !== "object") return item;
              const legacyItem = item as Record<string, unknown>;
              return {
                ...legacyItem,
                hours: legacyItem.hours ?? legacyItem.quantity ?? 1,
              };
            })
          : [],
      };
      const invoice = invoiceDraftSchema.safeParse(migrated);
      return invoice.success && typeof candidate.updatedAt === "string"
        ? [{ invoice: invoice.data, updatedAt: candidate.updatedAt }]
        : [];
    });
  } catch {
    return [];
  }
}

export function saveDraft(invoice: Invoice): SavedDraft[] {
  const drafts = readDrafts();
  const next = [
    { invoice, updatedAt: new Date().toISOString() },
    ...drafts.filter((draft) => draft.invoice.id !== invoice.id),
  ].slice(0, 10);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteDraft(id: string): SavedDraft[] {
  const next = readDrafts().filter((draft) => draft.invoice.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
