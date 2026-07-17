// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClientRecord, Profile } from "@/lib/contacts";
import { createDefaultInvoice } from "@/lib/invoice";

let temporaryDirectory: string;
let database: typeof import("@/lib/database");

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(path.join(tmpdir(), "invoice-db-"));
  process.env.INVOICE_DB_PATH = path.join(temporaryDirectory, "test.sqlite");
  database = await import("@/lib/database");
});

afterAll(() => {
  delete process.env.INVOICE_DB_PATH;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("profile persistence", () => {
  it("stores and updates the freelancer profile", () => {
    const profile: Profile = {
      name: "Acme Studio",
      email: "hello@example.com",
      address: "Berlin",
      taxNumber: "12/345/67890",
      vatNumber: "DE123456789",
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
    };
    expect(database.getProfile()).toBeNull();
    database.saveProfile(profile);
    expect(database.getProfile()).toEqual(profile);
    database.saveProfile({ ...profile, address: "Hamburg" });
    expect(database.getProfile()?.address).toBe("Hamburg");
  });
});

describe("client persistence", () => {
  let saved: ClientRecord;

  it("creates and lists clients", () => {
    saved = database.saveClient({
      name: "Northstar GmbH",
      email: "billing@northstar.example",
      address: "Munich",
      vatNumber: "DE987654321",
    });
    expect(database.listClients()).toEqual([saved]);
  });

  it("updates and deletes a client", () => {
    const updated = database.saveClient({
      id: saved.id,
      name: saved.name,
      email: saved.email,
      address: "Cologne",
      vatNumber: saved.vatNumber,
    });
    expect(database.listClients()[0]?.address).toBe("Cologne");
    expect(database.deleteClient(updated.id)).toBe(true);
    expect(database.listClients()).toEqual([]);
  });
});

describe("invoice persistence", () => {
  it("saves drafts, changes status, and advances the invoice number", () => {
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
    expect(database.getNextInvoiceNumber()).toBe(`INV-${year}-001`);
    const saved = database.saveInvoice(invoice);
    expect(saved.status).toBe("draft");
    expect(database.listInvoices()).toHaveLength(1);
    expect(database.getNextInvoiceNumber()).toBe(`INV-${year}-002`);

    const sent = database.updateInvoiceStatus(invoice.id, "sent");
    expect(sent?.status).toBe("sent");
    expect(sent?.sentAt).not.toBeNull();

    const paid = database.updateInvoiceStatus(invoice.id, "paid");
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).not.toBeNull();
    expect(database.deleteInvoice(invoice.id)).toBe(true);
    expect(database.listInvoices()).toEqual([]);
  });
});
