import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ClientInput, ClientRecord, Profile } from "@/lib/contacts";
import { invoiceSchema, type Invoice } from "@/lib/invoice";
import type { InvoiceStatus, SavedInvoiceRecord } from "@/lib/saved-invoices";

type DatabaseState = { connection?: Database.Database };
const globalDatabase = globalThis as typeof globalThis & { invoiceDatabase?: DatabaseState };

function createConnection(): Database.Database {
  const databasePath = process.env.INVOICE_DB_PATH ?? path.join(process.cwd(), "data", "invoice-studio.sqlite");
  const dataDirectory = path.dirname(databasePath);
  mkdirSync(dataDirectory, { recursive: true });
  const connection = new Database(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      tax_number TEXT NOT NULL DEFAULT '',
      vat_number TEXT NOT NULL DEFAULT '',
      iban TEXT NOT NULL,
      bic TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      vat_number TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS clients_name_idx ON clients(name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
      invoice_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      paid_at TEXT
    );

    CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
    CREATE INDEX IF NOT EXISTS invoices_updated_idx ON invoices(updated_at DESC);
  `);
  return connection;
}

function db(): Database.Database {
  globalDatabase.invoiceDatabase ??= {};
  globalDatabase.invoiceDatabase.connection ??= createConnection();
  const connection = globalDatabase.invoiceDatabase.connection;
  // Run additive migrations for long-lived dev connections after hot reloads.
  connection.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
      invoice_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
    CREATE INDEX IF NOT EXISTS invoices_updated_idx ON invoices(updated_at DESC);
  `);
  return connection;
}

type ProfileRow = {
  name: string;
  email: string;
  address: string;
  tax_number: string;
  vat_number: string;
  iban: string;
  bic: string;
};

type ClientRow = {
  id: string;
  name: string;
  email: string;
  address: string;
  vat_number: string;
  updated_at: string;
};

type InvoiceRow = {
  status: InvoiceStatus;
  invoice_data: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  paid_at: string | null;
};

const mapProfile = (row: ProfileRow): Profile => ({
  name: row.name,
  email: row.email,
  address: row.address,
  taxNumber: row.tax_number,
  vatNumber: row.vat_number,
  iban: row.iban,
  bic: row.bic,
});

const mapClient = (row: ClientRow): ClientRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  address: row.address,
  vatNumber: row.vat_number,
  updatedAt: row.updated_at,
});

const mapInvoice = (row: InvoiceRow): SavedInvoiceRecord => ({
  invoice: invoiceSchema.parse((() => {
    const stored = JSON.parse(row.invoice_data) as Record<string, unknown>;
    return { ...stored, reverseCharge: stored.reverseCharge === true };
  })()),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  sentAt: row.sent_at,
  paidAt: row.paid_at,
});

export function getProfile(): Profile | null {
  const row = db().prepare("SELECT name, email, address, tax_number, vat_number, iban, bic FROM profile WHERE id = 1").get() as ProfileRow | undefined;
  return row ? mapProfile(row) : null;
}

export function saveProfile(profile: Profile): Profile {
  const updatedAt = new Date().toISOString();
  db().prepare(`
    INSERT INTO profile (id, name, email, address, tax_number, vat_number, iban, bic, updated_at)
    VALUES (1, @name, @email, @address, @taxNumber, @vatNumber, @iban, @bic, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      address = excluded.address,
      tax_number = excluded.tax_number,
      vat_number = excluded.vat_number,
      iban = excluded.iban,
      bic = excluded.bic,
      updated_at = excluded.updated_at
  `).run({ ...profile, updatedAt });
  return profile;
}

export function listClients(): ClientRecord[] {
  const rows = db().prepare("SELECT id, name, email, address, vat_number, updated_at FROM clients ORDER BY name COLLATE NOCASE").all() as ClientRow[];
  return rows.map(mapClient);
}

export function saveClient(input: ClientInput): ClientRecord {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO clients (id, name, email, address, vat_number, created_at, updated_at)
    VALUES (@id, @name, @email, @address, @vatNumber, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      address = excluded.address,
      vat_number = excluded.vat_number,
      updated_at = excluded.updated_at
  `).run({ id, ...input, now });
  return { id, name: input.name, email: input.email, address: input.address, vatNumber: input.vatNumber, updatedAt: now };
}

export function deleteClient(id: string): boolean {
  return db().prepare("DELETE FROM clients WHERE id = ?").run(id).changes > 0;
}

export function listInvoices(): SavedInvoiceRecord[] {
  const rows = db().prepare(`
    SELECT status, invoice_data, created_at, updated_at, sent_at, paid_at
    FROM invoices
    ORDER BY updated_at DESC
  `).all() as InvoiceRow[];
  return rows.map(mapInvoice);
}

export function saveInvoice(invoice: Invoice): SavedInvoiceRecord {
  const now = new Date().toISOString();
  const existing = db().prepare("SELECT status, created_at, sent_at, paid_at FROM invoices WHERE id = ?").get(invoice.id) as
    | Pick<InvoiceRow, "status" | "created_at" | "sent_at" | "paid_at">
    | undefined;
  const status = existing?.status ?? "draft";
  const createdAt = existing?.created_at ?? now;
  db().prepare(`
    INSERT INTO invoices (id, invoice_number, status, invoice_data, created_at, updated_at, sent_at, paid_at)
    VALUES (@id, @invoiceNumber, @status, @invoiceData, @createdAt, @now, @sentAt, @paidAt)
    ON CONFLICT(id) DO UPDATE SET
      invoice_number = excluded.invoice_number,
      invoice_data = excluded.invoice_data,
      updated_at = excluded.updated_at
  `).run({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status,
    invoiceData: JSON.stringify(invoice),
    createdAt,
    now,
    sentAt: existing?.sent_at ?? null,
    paidAt: existing?.paid_at ?? null,
  });
  return getInvoice(invoice.id)!;
}

export function getInvoice(id: string): SavedInvoiceRecord | null {
  const row = db().prepare(`
    SELECT status, invoice_data, created_at, updated_at, sent_at, paid_at
    FROM invoices WHERE id = ?
  `).get(id) as InvoiceRow | undefined;
  return row ? mapInvoice(row) : null;
}

export function updateInvoiceStatus(id: string, status: InvoiceStatus): SavedInvoiceRecord | null {
  const existing = getInvoice(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db().prepare(`
    UPDATE invoices SET
      status = @status,
      updated_at = @now,
      sent_at = CASE WHEN @status = 'sent' AND sent_at IS NULL THEN @now ELSE sent_at END,
      paid_at = CASE WHEN @status = 'paid' AND paid_at IS NULL THEN @now ELSE paid_at END
    WHERE id = @id
  `).run({ id, status, now });
  return getInvoice(id);
}

export function deleteInvoice(id: string): boolean {
  return db().prepare("DELETE FROM invoices WHERE id = ?").run(id).changes > 0;
}

export function getNextInvoiceNumber(date = new Date()): string {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const rows = db().prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?").all(`${prefix}%`) as Array<{ invoice_number: string }>;
  const highest = rows.reduce((maximum, row) => {
    const match = row.invoice_number.match(new RegExp(`^INV-${year}-(\\d+)$`));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}
