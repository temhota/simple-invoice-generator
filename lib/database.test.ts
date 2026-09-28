// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { ClientRecord, Profile } from "@/lib/contacts";
import { createDefaultInvoice } from "@/lib/invoice";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let database: typeof import("@/lib/database");
const firstUserId = "00000000-0000-4000-8000-000000000001";
const secondUserId = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  if (!testDatabaseUrl) return;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_SSL ??= "disable";
  const sql = postgres(testDatabaseUrl, {
    max: 1,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  await sql`CREATE SCHEMA IF NOT EXISTS auth`;
  await sql`
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql.unsafe(`
    DO $$
    BEGIN
      IF TO_REGPROCEDURE('auth.uid()') IS NULL THEN
        EXECUTE 'CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS ''SELECT NULLIF(current_setting(''''request.jwt.claim.sub'''', true), '''''''')::UUID''';
      END IF;
    END $$
  `);
  const migrationsDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  // The production runner replays every migration on each invocation.
  for (const migrationFile of [...migrations, ...migrations]) {
    const migration = await readFile(
      path.join(migrationsDirectory, migrationFile),
      "utf8",
    );
    await sql.unsafe(migration);
  }
  await sql`TRUNCATE profile, clients, invoices, ai_usage`;
  await sql`
    INSERT INTO auth.users (id) VALUES (${firstUserId}), (${secondUserId})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql.end();
  database = await import("@/lib/database");
});

afterAll(async () => {
  if (!testDatabaseUrl || !database) return;
  const sql = postgres(testDatabaseUrl, {
    max: 1,
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  await database.closeDatabase();
  await sql`DELETE FROM auth.users WHERE id IN (${firstUserId}, ${secondUserId})`;
  await sql.end();
  delete process.env.DATABASE_URL;
});

describeWithDatabase("PostgreSQL persistence", () => {
  it("prevents API users from resetting or creating AI quota records", async () => {
    const sql = postgres(testDatabaseUrl!, {
      max: 1,
      prepare: false,
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    });
    try {
      await sql.begin(async (transaction) => {
        await transaction`CREATE ROLE invoice_quota_test_client NOLOGIN`;
        await transaction`GRANT USAGE ON SCHEMA public, auth TO invoice_quota_test_client`;
        await transaction`GRANT SELECT, INSERT, UPDATE, DELETE ON ai_usage TO invoice_quota_test_client`;
        await transaction`
          INSERT INTO ai_usage (user_id, request_count) VALUES (${firstUserId}, 20)
          ON CONFLICT (user_id) DO UPDATE SET request_count = 20
        `;
        await transaction`SELECT set_config('request.jwt.claim.sub', ${firstUserId}, true)`;
        await transaction`SET LOCAL ROLE invoice_quota_test_client`;
        expect(await transaction`SELECT request_count FROM ai_usage`).toEqual([
          { request_count: 20 },
        ]);
        expect(
          (
            await transaction`UPDATE ai_usage SET request_count = 0 WHERE user_id = ${firstUserId}`
          ).count,
        ).toBe(0);
        expect(
          (
            await transaction`DELETE FROM ai_usage WHERE user_id = ${firstUserId}`
          ).count,
        ).toBe(0);
        await transaction`SELECT set_config('request.jwt.claim.sub', ${secondUserId}, true)`;
        expect(await transaction`SELECT request_count FROM ai_usage`).toEqual(
          [],
        );
        await expect(
          transaction.savepoint(async (savepoint) => {
            await savepoint`INSERT INTO ai_usage (user_id, request_count) VALUES (${secondUserId}, 0)`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
        await transaction`RESET ROLE`;
        expect(
          await transaction`SELECT request_count FROM ai_usage WHERE user_id = ${firstUserId}`,
        ).toEqual([{ request_count: 20 }]);
        await transaction`DELETE FROM ai_usage WHERE user_id = ${firstUserId}`;
        await transaction`DROP OWNED BY invoice_quota_test_client`;
        await transaction`DROP ROLE invoice_quota_test_client`;
      });
    } finally {
      await sql.end();
    }
  });

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
    expect(await database.getProfile(firstUserId)).toBeNull();
    await database.saveProfile(firstUserId, profile);
    expect(await database.getProfile(firstUserId)).toEqual(profile);
    expect(await database.getProfile(secondUserId)).toBeNull();
    await database.saveProfile(firstUserId, { ...profile, address: "Hamburg" });
    expect((await database.getProfile(firstUserId))?.address).toBe("Hamburg");
  });

  it("creates, updates, and deletes clients", async () => {
    const saved: ClientRecord = await database.saveClient(firstUserId, {
      name: "Northstar GmbH",
      email: "billing@northstar.example",
      address: "Munich",
      vatNumber: "DE987654321",
    });
    expect(await database.listClients(firstUserId)).toEqual([saved]);
    expect(await database.listClients(secondUserId)).toEqual([]);

    const updated = await database.saveClient(firstUserId, {
      ...saved,
      address: "Cologne",
    });
    expect((await database.listClients(firstUserId))[0]?.address).toBe(
      "Cologne",
    );
    expect(await database.deleteClient(secondUserId, updated.id)).toBe(false);
    expect(await database.deleteClient(firstUserId, updated.id)).toBe(true);
    expect(await database.listClients(firstUserId)).toEqual([]);
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
    invoice.items = [
      {
        id: crypto.randomUUID(),
        description: "Design",
        hours: 4,
        unitPriceCents: 10_000,
      },
    ];

    const year = new Date().getFullYear();
    expect(await database.getNextInvoiceNumber(firstUserId)).toBe(
      `INV-${year}-001`,
    );
    const saved = await database.saveInvoice(firstUserId, invoice);
    expect(saved.status).toBe("draft");
    expect(await database.listInvoices(firstUserId)).toHaveLength(1);
    expect(await database.listInvoices(secondUserId)).toEqual([]);
    expect(await database.getNextInvoiceNumber(firstUserId)).toBe(
      `INV-${year}-002`,
    );
    expect(await database.getNextInvoiceNumber(secondUserId)).toBe(
      `INV-${year}-001`,
    );

    expect(
      await database.updateInvoiceStatus(secondUserId, invoice.id, "sent"),
    ).toBeNull();
    const sent = await database.updateInvoiceStatus(
      firstUserId,
      invoice.id,
      "sent",
    );
    expect(sent?.status).toBe("sent");
    expect(sent?.sentAt).not.toBeNull();

    const paid = await database.updateInvoiceStatus(
      firstUserId,
      invoice.id,
      "paid",
    );
    expect(paid?.status).toBe("paid");
    expect(paid?.paidAt).not.toBeNull();
    expect(await database.deleteInvoice(secondUserId, invoice.id)).toBe(false);
    expect(await database.deleteInvoice(firstUserId, invoice.id)).toBe(true);
    expect(await database.listInvoices(firstUserId)).toEqual([]);
  });

  it("limits AI description requests independently for each user", async () => {
    expect(await database.consumeAiDescriptionRequest(firstUserId, 2)).toBe(
      true,
    );
    expect(await database.consumeAiDescriptionRequest(firstUserId, 2)).toBe(
      true,
    );
    expect(await database.consumeAiDescriptionRequest(firstUserId, 2)).toBe(
      false,
    );
    expect(await database.consumeAiDescriptionRequest(secondUserId, 2)).toBe(
      true,
    );
  });
});
