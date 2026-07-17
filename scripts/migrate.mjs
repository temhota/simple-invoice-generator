import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
});

try {
  const migration = await readFile(path.join(process.cwd(), "migrations", "001_initial.sql"), "utf8");
  await sql.unsafe(migration);
  console.log("PostgreSQL schema is up to date.");
} finally {
  await sql.end();
}
