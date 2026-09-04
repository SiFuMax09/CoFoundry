import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { apiKeys } from "./db/schema";
import { newId } from "./db/ids";
import { encryptSecret, decryptSecret, maskSecret } from "./crypto";

const PROVIDER = "openrouter";

export function getDecryptedApiKey(userId: string): string | null {
  const row = db
    .select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, PROVIDER)))
    .get();
  if (!row) return null;
  return decryptSecret(row.encryptedKey);
}

export function getMaskedApiKey(userId: string): string | null {
  const key = getDecryptedApiKey(userId);
  return key ? maskSecret(key) : null;
}

export function setApiKey(userId: string, plaintext: string) {
  const encryptedKey = encryptSecret(plaintext);
  const existing = db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, PROVIDER)))
    .get();

  if (existing) {
    db.update(apiKeys)
      .set({ encryptedKey, updatedAt: new Date() })
      .where(eq(apiKeys.id, existing.id))
      .run();
  } else {
    db.insert(apiKeys)
      .values({ id: newId("key"), userId, provider: PROVIDER, encryptedKey })
      .run();
  }
}

export function deleteApiKey(userId: string) {
  db.delete(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, PROVIDER))).run();
}
