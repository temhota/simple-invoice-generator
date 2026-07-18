import postgres, { type Sql } from "postgres";
import type { ClientInput, ClientRecord, Profile } from "@/lib/contacts";
import { invoiceSchema, type Invoice } from "@/lib/invoice";
import type { InvoiceStatus, SavedInvoiceRecord } from "@/lib/saved-invoices";

type DatabaseState = { connection?: Sql };
const globalDatabase = globalThis as typeof globalThis & { invoiceDatabase?: DatabaseState };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

function db(): Sql {
  globalDatabase.invoiceDatabase ??= {};
  globalDatabase.invoiceDatabase.connection ??= postgres(databaseUrl(), {
    // A serverless instance should keep a single pooled connection. Opening
    // four connections during the initial render can exhaust or stall the
    // Supabase transaction pooler, while postgres.js safely queues queries.
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  return globalDatabase.invoiceDatabase.connection;
}

export async function closeDatabase(): Promise<void> {
  const connection = globalDatabase.invoiceDatabase?.connection;
  if (connection) await connection.end();
  globalDatabase.invoiceDatabase = {};
}

type DatabaseTimestamp = Date | string;

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
  updated_at: DatabaseTimestamp;
};

type InvoiceRow = {
  status: InvoiceStatus;
  invoice_data: Record<string, unknown> | string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
  sent_at: DatabaseTimestamp | null;
  paid_at: DatabaseTimestamp | null;
};

type InitialDataRow = {
  profile: ProfileRow | null;
  clients: ClientRow[];
  invoices: Array<InvoiceRow & { invoice_number: string }>;
};

export type InitialInvoiceData = {
  profile: Profile | null;
  clients: ClientRecord[];
  invoices: SavedInvoiceRecord[];
  nextInvoiceNumber: string;
};

const toIsoString = (value: DatabaseTimestamp): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

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
  updatedAt: toIsoString(row.updated_at),
});

const mapInvoice = (row: InvoiceRow): SavedInvoiceRecord => {
  const stored = typeof row.invoice_data === "string"
    ? JSON.parse(row.invoice_data) as Record<string, unknown>
    : row.invoice_data;
  return {
    invoice: invoiceSchema.parse({ ...stored, reverseCharge: stored.reverseCharge === true }),
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    sentAt: row.sent_at ? toIsoString(row.sent_at) : null,
    paidAt: row.paid_at ? toIsoString(row.paid_at) : null,
  };
};

export async function getInitialInvoiceData(userId: string, date = new Date()): Promise<InitialInvoiceData> {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const [row] = await db()<InitialDataRow[]>`
    SELECT
      (
        SELECT ROW_TO_JSON(profile_row)
        FROM (
          SELECT name, email, address, tax_number, vat_number, iban, bic
          FROM profile
          WHERE user_id = ${userId}
        ) AS profile_row
      ) AS profile,
      COALESCE((
        SELECT JSONB_AGG(TO_JSONB(client_row) ORDER BY LOWER(client_row.name))
        FROM (
          SELECT id, name, email, address, vat_number, updated_at
          FROM clients
          WHERE user_id = ${userId}
        ) AS client_row
      ), '[]'::JSONB) AS clients,
      COALESCE((
        SELECT JSONB_AGG(TO_JSONB(invoice_row) ORDER BY invoice_row.updated_at DESC)
        FROM (
          SELECT invoice_number, status, invoice_data, created_at, updated_at, sent_at, paid_at
          FROM invoices
          WHERE user_id = ${userId}
        ) AS invoice_row
      ), '[]'::JSONB) AS invoices
  `;

  if (!row) throw new Error("Initial invoice data was not loaded");
  const highest = row.invoices.reduce((maximum, invoiceRow) => {
    const match = invoiceRow.invoice_number.match(new RegExp(`^INV-${year}-(\\d+)$`));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);

  return {
    profile: row.profile ? mapProfile(row.profile) : null,
    clients: row.clients.map(mapClient),
    invoices: row.invoices.map(mapInvoice),
    nextInvoiceNumber: `${prefix}${String(highest + 1).padStart(3, "0")}`,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db()<ProfileRow[]>`
    SELECT name, email, address, tax_number, vat_number, iban, bic
    FROM profile
    WHERE user_id = ${userId}
  `;
  return row ? mapProfile(row) : null;
}

export async function saveProfile(userId: string, profile: Profile): Promise<Profile> {
  await db()`
    INSERT INTO profile (user_id, name, email, address, tax_number, vat_number, iban, bic, updated_at)
    VALUES (${userId}, ${profile.name}, ${profile.email}, ${profile.address}, ${profile.taxNumber},
      ${profile.vatNumber}, ${profile.iban}, ${profile.bic}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      tax_number = EXCLUDED.tax_number,
      vat_number = EXCLUDED.vat_number,
      iban = EXCLUDED.iban,
      bic = EXCLUDED.bic,
      updated_at = EXCLUDED.updated_at
  `;
  return profile;
}

export async function listClients(userId: string): Promise<ClientRecord[]> {
  const rows = await db()<ClientRow[]>`
    SELECT id, name, email, address, vat_number, updated_at
    FROM clients
    WHERE user_id = ${userId}
    ORDER BY LOWER(name)
  `;
  return rows.map(mapClient);
}

export async function saveClient(userId: string, input: ClientInput): Promise<ClientRecord> {
  const id = input.id ?? crypto.randomUUID();
  const [row] = await db()<ClientRow[]>`
    INSERT INTO clients (id, user_id, name, email, address, vat_number, created_at, updated_at)
    VALUES (${id}, ${userId}, ${input.name}, ${input.email}, ${input.address}, ${input.vatNumber}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      vat_number = EXCLUDED.vat_number,
      updated_at = EXCLUDED.updated_at
    WHERE clients.user_id = EXCLUDED.user_id
    RETURNING id, name, email, address, vat_number, updated_at
  `;
  if (!row) throw new Error("Client was not saved");
  return mapClient(row);
}

export async function deleteClient(userId: string, id: string): Promise<boolean> {
  const result = await db()`DELETE FROM clients WHERE id = ${id} AND user_id = ${userId}`;
  return result.count > 0;
}

export async function listInvoices(userId: string): Promise<SavedInvoiceRecord[]> {
  const rows = await db()<InvoiceRow[]>`
    SELECT status, invoice_data, created_at, updated_at, sent_at, paid_at
    FROM invoices
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return rows.map(mapInvoice);
}

export async function saveInvoice(userId: string, invoice: Invoice): Promise<SavedInvoiceRecord> {
  const [row] = await db()<InvoiceRow[]>`
    INSERT INTO invoices (
      id, user_id, invoice_number, status, invoice_data, created_at, updated_at, sent_at, paid_at
    )
    VALUES (
      ${invoice.id}, ${userId}, ${invoice.invoiceNumber}, 'draft', ${db().json(invoice)}, NOW(), NOW(), NULL, NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      invoice_number = EXCLUDED.invoice_number,
      invoice_data = EXCLUDED.invoice_data,
      updated_at = EXCLUDED.updated_at
    WHERE invoices.user_id = EXCLUDED.user_id
    RETURNING status, invoice_data, created_at, updated_at, sent_at, paid_at
  `;
  if (!row) throw new Error("Invoice was not saved");
  return mapInvoice(row);
}

export async function getInvoice(userId: string, id: string): Promise<SavedInvoiceRecord | null> {
  const [row] = await db()<InvoiceRow[]>`
    SELECT status, invoice_data, created_at, updated_at, sent_at, paid_at
    FROM invoices
    WHERE id = ${id} AND user_id = ${userId}
  `;
  return row ? mapInvoice(row) : null;
}

export async function updateInvoiceStatus(
  userId: string,
  id: string,
  status: InvoiceStatus,
): Promise<SavedInvoiceRecord | null> {
  const [row] = await db()<InvoiceRow[]>`
    UPDATE invoices SET
      status = ${status},
      updated_at = NOW(),
      sent_at = CASE WHEN ${status} = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
      paid_at = CASE WHEN ${status} = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING status, invoice_data, created_at, updated_at, sent_at, paid_at
  `;
  return row ? mapInvoice(row) : null;
}

export async function deleteInvoice(userId: string, id: string): Promise<boolean> {
  const result = await db()`DELETE FROM invoices WHERE id = ${id} AND user_id = ${userId}`;
  return result.count > 0;
}

export async function getNextInvoiceNumber(userId: string, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const rows = await db()<Array<{ invoice_number: string }>>`
    SELECT invoice_number
    FROM invoices
    WHERE user_id = ${userId} AND invoice_number LIKE ${`${prefix}%`}
  `;
  const highest = rows.reduce((maximum, row) => {
    const match = row.invoice_number.match(new RegExp(`^INV-${year}-(\\d+)$`));
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}
