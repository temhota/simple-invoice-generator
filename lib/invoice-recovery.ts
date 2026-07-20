import { invoiceRecoverySchema, type Invoice } from "@/lib/invoice";

const STORAGE_KEY_PREFIX = "simple-invoice-recovery-v1";
const LEGACY_STORAGE_KEY = "simple-invoice-drafts-v1";

export type InvoiceRecovery = {
  invoice: Invoice;
  updatedAt: string;
};

const storageKey = (userKey: string) =>
  `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userKey.trim().toLowerCase())}`;

function parseRecovery(value: unknown): InvoiceRecovery | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { invoice?: unknown; updatedAt?: unknown };
  const rawInvoice = candidate.invoice;
  if (!rawInvoice || typeof rawInvoice !== "object") return null;
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
  const invoice = invoiceRecoverySchema.safeParse(migrated);
  return invoice.success && typeof candidate.updatedAt === "string"
    ? { invoice: invoice.data, updatedAt: candidate.updatedAt }
    : null;
}

export function readInvoiceRecovery(userKey: string): InvoiceRecovery | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = parseRecovery(JSON.parse(window.localStorage.getItem(storageKey(userKey)) ?? "null"));
    if (scoped) return scoped;

    const legacy: unknown = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]");
    const migrated = Array.isArray(legacy) ? parseRecovery(legacy[0]) : null;
    if (!migrated) return null;

    window.localStorage.setItem(storageKey(userKey), JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export function saveInvoiceRecovery(userKey: string, invoice: Invoice): InvoiceRecovery {
  const recovery = { invoice, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(storageKey(userKey), JSON.stringify(recovery));
  return recovery;
}

export function clearInvoiceRecovery(userKey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(userKey));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}
