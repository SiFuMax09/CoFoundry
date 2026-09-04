import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { searchCache } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { chatCompletion } from "./openrouter";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const DEFAULT_MAX_RESULTS = 5;

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\säöüß?-]/gi, "");
}

function hashQuery(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * search_web — von Ultraplan-/Research-Sub-Agenten genutzt (nicht vom
 * normalen active_chat). Prüft zuerst den lokalen Such-Cache; bei einem
 * Miss läuft die Suche direkt über OpenRouter selbst (das `web`-Plugin,
 * $4/1000 Ergebnisse laut OpenRouter-Doku) — keine externe Suchmaschinen-
 * API, kein zweiter Key. Cache ist projektübergreifend, aber pro Nutzer
 * getrennt (kein Teilen fremder Rechercheergebnisse in einer Multi-User-
 * Instanz).
 */
export async function searchWeb(params: {
  query: string;
  userId: string;
  apiKey: string;
  maxResults?: number;
}): Promise<{ results: SearchResult[]; fromCache: boolean }> {
  const normalized = normalizeQuery(params.query);
  const queryHash = hashQuery(normalized);

  const cached = db
    .select()
    .from(searchCache)
    .where(and(eq(searchCache.userId, params.userId), eq(searchCache.queryHash, queryHash)))
    .get();

  if (cached && cached.createdAt && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
    return { results: JSON.parse(cached.resultsJson) as SearchResult[], fromCache: true };
  }

  const maxResults = params.maxResults ?? DEFAULT_MAX_RESULTS;
  const result = await chatCompletion({
    apiKey: params.apiKey,
    userId: params.userId,
    taskType: "research_subagent",
    messages: [
      {
        role: "user",
        content: `Suche im Web nach: "${params.query}". Fasse die relevantesten Treffer in 2-3 Sätzen zusammen.`,
      },
    ],
    webSearch: { maxResults },
  });

  const results: SearchResult[] = result.citations.map((c) => ({
    url: c.url,
    title: c.title ?? c.url,
    snippet: c.content?.slice(0, 300) ?? "",
  }));

  if (cached) {
    db.update(searchCache)
      .set({ resultsJson: JSON.stringify(results), createdAt: new Date() })
      .where(eq(searchCache.id, cached.id))
      .run();
  } else {
    db.insert(searchCache)
      .values({
        id: newId("search"),
        userId: params.userId,
        queryNormalized: normalized,
        queryHash,
        resultsJson: JSON.stringify(results),
      })
      .run();
  }

  return { results, fromCache: false };
}

/** Tool-Definition für die Tool-Calling-Schleife der Ultraplan-/Research-Sub-Agenten. */
export const searchWebToolDefinition = {
  type: "function" as const,
  function: {
    name: "search_web",
    description: "Durchsucht das Web nach einer konkreten Anfrage und liefert Titel/URL/Kurzfassung der Treffer.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Konkrete, präzise Suchanfrage." },
      },
      required: ["query"],
    },
  },
};
