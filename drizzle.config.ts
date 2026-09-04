import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.COFOUNDRY_DB_PATH ?? "data/cofoundry.db",
  },
} satisfies Config;
