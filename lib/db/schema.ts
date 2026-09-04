import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Cofoundry — Drizzle-Schema (SQLite)
 *
 * Konventionen:
 * - IDs sind zufällige Text-IDs (crypto.randomUUID()), von der Anwendung
 *   vor dem Insert erzeugt (siehe lib/db/ids.ts) — keine Auto-Increment-IDs,
 *   damit sie sich sicher in URLs und Canvas-Links referenzieren lassen.
 * - Zeitstempel sind Unix-Millisekunden (integer), Default über SQL `strftime`.
 * - `order` ist ein SQL-Schlüsselwort → die DB-Spalte heißt `sort_order`,
 *   im Code bleibt das Drizzle-Feld `order`.
 */

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at"),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

// provider ist praktisch immer "openrouter" — als eigenes Feld statt fest
// verdrahtet, falls später ein zweiter Provider-Key nötig würde.
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  updatedAt: timestamp("updated_at"),
}, (t) => [uniqueIndex("api_keys_user_provider_idx").on(t.userId, t.provider)]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Strukturierte Antworten aus dem Onboarding-Wizard (Kategorie, Branche,
  // Zeit/Budget, Teamgröße, Commitment) — als JSON, da rein zur Anzeige und
  // als Ultraplan-Kontext genutzt, nicht einzeln abgefragt.
  onboardingJson: text("onboarding_json"),
  createdAt: timestamp("created_at"),
}, (t) => [index("projects_user_idx").on(t.userId)]);

export const phaseStatusValues = ["todo", "active", "done"] as const;
export type PhaseStatus = (typeof phaseStatusValues)[number];

export const phases = sqliteTable("phases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goal: text("goal").notNull().default(""),
  brief: text("brief").notNull().default(""),
  status: text("status", { enum: phaseStatusValues }).notNull().default("todo"),
  order: integer("sort_order").notNull(),
  systemPromptOverride: text("system_prompt_override"),
  // Manueller Umschalter im Chat-Panel dieser Phase; NULL = Default aus
  // lib/ai/tasks.ts (task_type "active_chat") gilt.
  activeChatModel: text("active_chat_model"),
  // Treibt die Bereitschafts-Karte (Phase 0) bzw. den "Bereit für Phase X?"-
  // Streifen (ab Phase 1). NULL = kein offener Hinweis / zurückgezogen.
  readySummary: text("ready_summary"),
  readyAt: integer("ready_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
}, (t) => [index("phases_project_idx").on(t.projectId, t.order)]);

export const canvasItemTypeValues = ["document", "note", "website", "calendar"] as const;
export type CanvasItemType = (typeof canvasItemTypeValues)[number];
export const canvasItemStatusValues = ["draft", "final"] as const;

export const canvasItems = sqliteTable("canvas_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  phaseId: text("phase_id").references(() => phases.id, { onDelete: "set null" }),
  type: text("type", { enum: canvasItemTypeValues }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  color: text("color"),
  status: text("status", { enum: canvasItemStatusValues }),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull().default(280),
  height: real("height").notNull().default(200),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, (t) => [
  index("canvas_items_project_idx").on(t.projectId),
  index("canvas_items_phase_idx").on(t.phaseId),
]);

export const canvasLinks = sqliteTable("canvas_links", {
  id: text("id").primaryKey(),
  fromItemId: text("from_item_id").notNull().references(() => canvasItems.id, { onDelete: "cascade" }),
  toItemId: text("to_item_id").notNull().references(() => canvasItems.id, { onDelete: "cascade" }),
  relationLabel: text("relation_label").notNull().default(""),
}, (t) => [
  index("canvas_links_from_idx").on(t.fromItemId),
  index("canvas_links_to_idx").on(t.toItemId),
]);

export const editedByValues = ["user", "agent"] as const;

export const canvasItemVersions = sqliteTable("canvas_item_versions", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => canvasItems.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  title: text("title").notNull(),
  editedBy: text("edited_by", { enum: editedByValues }).notNull(),
  createdAt: timestamp("created_at"),
}, (t) => [index("canvas_item_versions_item_idx").on(t.itemId, t.createdAt)]);

// Projektübergreifend, aber pro Nutzer getrennt (kein Teilen fremder
// Rechercheergebnisse in einer Multi-User-Instanz).
export const searchCache = sqliteTable("search_cache", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  queryNormalized: text("query_normalized").notNull(),
  queryHash: text("query_hash").notNull(),
  resultsJson: text("results_json").notNull(),
  createdAt: timestamp("created_at"),
}, (t) => [uniqueIndex("search_cache_user_hash_idx").on(t.userId, t.queryHash)]);

export const chatMessageRoleValues = ["user", "assistant", "tool", "system", "summary"] as const;

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  phaseId: text("phase_id").notNull().references(() => phases.id, { onDelete: "cascade" }),
  role: text("role", { enum: chatMessageRoleValues }).notNull(),
  content: text("content").notNull().default(""),
  // Roh-JSON der vom Modell angeforderten bzw. vom Server ausgeführten
  // Tool-Calls dieser Nachricht (NULL, wenn keine).
  toolCalls: text("tool_calls"),
  model: text("model"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  createdAt: timestamp("created_at"),
}, (t) => [index("chat_messages_phase_idx").on(t.phaseId, t.createdAt)]);

export const usageLog = sqliteTable("usage_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  taskType: text("task_type").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costEstimate: real("cost_estimate").notNull().default(0),
  createdAt: timestamp("created_at"),
}, (t) => [index("usage_log_user_idx").on(t.userId, t.createdAt)]);

export const ultraplanRunStatusValues = ["dispatching", "proposed", "accepted", "failed"] as const;

// Hält den Ultraplan-Dispatch zwischen "Sub-Agenten fertig" und
// "Nutzer bestätigt Roadmap" fest. "Anpassen" synthetisiert erneut aus
// agentResultsJson, ohne die Sub-Agenten (und ihre Websuchen) erneut zu
// bezahlen.
export const ultraplanRuns = sqliteTable("ultraplan_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status", { enum: ultraplanRunStatusValues }).notNull().default("dispatching"),
  briefingJson: text("briefing_json").notNull(),
  agentResultsJson: text("agent_results_json"),
  proposalJson: text("proposal_json"),
  createdAt: timestamp("created_at"),
}, (t) => [index("ultraplan_runs_project_idx").on(t.projectId)]);
