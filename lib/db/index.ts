import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DB_PATH = process.env.COFOUNDRY_DB_PATH ?? "data/cofoundry.db";

function openDatabase() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

// Ein einziger Verbindungs-Singleton pro Prozess — Next.js lädt Module in
// Dev/HMR mehrfach neu, daher am globalThis verankert.
const globalForDb = globalThis as unknown as {
  __cofoundrySqlite?: Database.Database;
};

const sqlite = globalForDb.__cofoundrySqlite ?? openDatabase();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__cofoundrySqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
