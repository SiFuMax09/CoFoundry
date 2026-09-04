import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./index";
import { users } from "./schema";
import { newId } from "./ids";

async function seed() {
  const email = process.env.SEED_EMAIL?.trim().toLowerCase() || "founder@cofoundry.local";
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    console.log(`Seed-Account existiert bereits: ${email}`);
    sqlite.close();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  db.insert(users).values({ id: newId("user"), email, passwordHash }).run();

  console.log("Seed-Account angelegt:");
  console.log(`  E-Mail:    ${email}`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`  Passwort:  ${password}  (zufällig erzeugt — jetzt notieren)`);
  } else {
    console.log("  Passwort:  wie in SEED_PASSWORD gesetzt");
  }
  sqlite.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
