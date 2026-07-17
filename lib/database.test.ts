// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { ClientRecord, Profile } from "@/lib/contacts";
import { createDefaultInvoice } from "@/lib/invoice";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let database: typeof import("@/lib/database");

beforeAll(async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_SSL ??= "disable";
  const sql = postgres(testDatabaseUrl, {
    max: 1,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  const migration = await readFile(path.join(process.cwd(), "migrations", "001_initial.sql"), "utf8");
  await sql.unsafe(migration);
  await sql`TRUNCATE profile, clients, invoices`;
  await sql.end();
  database = await import("@/lib/database");
});

afterAll(async () => {
  if (!testDatabaseUrl || !database) return;
  await database.closeDatabase();
  delete process.env.DATABASE_URL;
});

describeWithDatabase("PostgreSQL persistence", () => {
  it("stores and updates the freelancer profile", async () => {
    const profile: Profile = {
      name: "Acme Studio",
      email: "hello@example.com",
      address: "Berlin",
      taxNumber: "12/345/67890",
      vatNumber: "DE123456789",
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
    };
    expect(await database.getProfile()).toBeNull();
    await database.saveProfile(profile);
    expect(await database.getProfile()).toEqual(profile);
    await database.saveProfile({ ...profile, address: "Hamburg" });
    expect((await database.getProfile())?.address).toBe("Hamburg");
  });

  it("creates, updates, and deletes clients", async () => {
    const saved: ClientRecord = await database.saveClient({
      name: "Northstar GmbH",
      email: "billing@northstar.example",
      address: "Munich",
      vatNumber: "DE987654321",
    });
    expect(await database.listClients()).toEqual([saved]);

    const updated = await database.saveClient({ ...saved, address: "Cologne" });
    expect((await database.listClients())[0]?.address).toBe("Cologne");
    expect(await database.deleteClient(updated.id)).toBe(true);
    expect(await database.listClients()).toEqual([]);
  });

  it("saves invoices, changes status, and advances the invoice number", async () => {
    const invoice = createDefaultInvoice();
    invoice.issuer = {
      name: "Acme Studio",
      email: "hello@example.com",
      address: "Berlin",
      taxNumber: "12/345/67890",
      vatNumber: "DE123456789",
    };
    invoice.client = {
      name: "Northstar GmbH",
      email: "billing@northstar.example",
      address: "Munich",
      vatNumber: "DE987654321",
    };
    invoice.banking = {
      accountName: "Acme Studio",
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
    };
    invoice.items = [{ id: crypto.randomUUID(), description: "Design", hours: 4, unitPriceCents: 10_000 }];

    const year = new Date().getFullYear();
    expect(await database.getNextInvoiceNumber()).toBe(`INV-${year}-001`);
    const saved = await database.saveInvoice(invoice);
    expect(saved.status).toBe("draft");
    expect(await database.listInvoices()).toHaveLength(1);
    expect(await database.getNextInvoiceNumber()).toBe(`INV-${year}-002`);

    const sent = await database.updateInvoiceStatus(invoice.id, "sent");
    expect(sent?.status).toBe("sent");
    expect(sent?.sentAt).not.toBeNull();

    const paid = await database.updateInvoiceStatus(invoice.id, "paid");
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).not.toBeNull();
    expect(await database.deleteInvoice(invoice.id)).toBe(true);
    expect(await database.listInvoices()).toEqual([]);
  });
});
