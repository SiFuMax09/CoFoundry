import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

export interface SessionData {
  userId?: string;
}

const sessionSecret = process.env.SESSION_SECRET;

export const sessionOptions: SessionOptions = {
  cookieName: "cofoundry_session",
  // iron-session verlangt mindestens 32 Zeichen für die Seal-Password.
  password: sessionSecret && sessionSecret.length >= 32 ? sessionSecret : "0".repeat(32),
  ttl: 60 * 60 * 24 * 14, // 14 Tage
  // httpOnly: true, secure: true, sameSite: "lax" sind die Defaults von
  // iron-session — hier nicht erneut gesetzt, um sie nicht versehentlich
  // abzuschwächen. "secure" funktioniert auch im lokalen Dev-Betrieb über
  // http://localhost, da Browser localhost als sicheren Kontext behandeln.
};

function assertSessionSecretConfigured() {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen). Siehe .env.local.example."
    );
  }
}

/** Für Server Components und Route Handler (App Router). */
export async function getSession(): Promise<IronSession<SessionData>> {
  assertSessionSecretConfigured();
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export interface AuthedUser {
  id: string;
  email: string;
}

/** Lädt den eingeloggten Nutzer, oder null ohne gültige Session. */
export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const user = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId))
    .get();
  return user ?? null;
}

/**
 * Für API-Routen: liefert entweder den Nutzer oder eine fertige 401-Response.
 * Aufrufmuster: `const auth = await requireUser(); if (auth.response) return auth.response;`
 */
export async function requireUser(): Promise<
  { user: AuthedUser; response: null } | { user: null; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }),
    };
  }
  return { user, response: null };
}

// --- Rate-Limiting für /api/auth/login -------------------------------------
// In-Memory-Sliding-Window, ausreichend für eine self-hosted Single-Instance.
// Kein Redis nötig — bei Neustart des Prozesses setzt sich das Limit zurück,
// was für Brute-Force-Schutz unkritisch ist.

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (entry.count >= LOGIN_LIMIT) {
    return { allowed: false, retryAfterMs: LOGIN_WINDOW_MS - (now - entry.windowStart) };
  }
  entry.count += 1;
  return { allowed: true };
}

export function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}
