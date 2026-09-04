import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./index";

migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrationen angewendet.");
sqlite.close();
