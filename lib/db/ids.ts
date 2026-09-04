import { randomUUID } from "node:crypto";

/** Zufällige Text-ID für alle Tabellen — sicher in URLs referenzierbar. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
