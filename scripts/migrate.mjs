import { readdir, readFile } from "node:fs/promises";
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
  const migrationsDirectory = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrations) {
    const migration = await readFile(path.join(migrationsDirectory, migrationFile), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${migrationFile}.`);
  }
  console.log("PostgreSQL schema is up to date.");
} finally {
  await sql.end();
}
