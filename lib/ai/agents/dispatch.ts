import { z } from "zod";
import type { ORMessage } from "@/lib/ai/openrouter";
import { chatCompletion } from "@/lib/ai/openrouter";
import { searchWeb, searchWebToolDefinition, type SearchResult } from "@/lib/ai/search";
import type { TaskType } from "@/lib/ai/tasks";

/**
 * Gemeinsame Dispatch-/Synthese-Infrastruktur für Ultraplan (lib/ai/ultraplan)
 * und das Research-Multi-Agent-System (lib/ai/research) — folgt dem
 * Orchestrator-Worker-Muster aus Anthropics "Building a Multi-Agent
 * Research System" (siehe docs/agent-architecture.md): ein Lead-Schritt
 * zerlegt die Aufgabe, mehrere Sub-Agenten arbeiten parallel mit eigenem,
 * engem Auftrag und festem Budget, ein Synthese-Schritt führt die Ergebnisse
 * zusammen.
 */

export interface AgentSpec<T> {
  name: string;
  /** Vollständiger Auftrag an den Sub-Agenten (Ziel, Format, Kontext). */
  instructions: string;
  taskType: TaskType;
  schema: z.ZodType<T>;
  jsonSchema: object;
  maxSearches?: number;
  timeoutMs?: number;
}

export type AgentRunResult<T> =
  | { name: string; status: "ok"; data: T; sources: SearchResult[] }
  | { name: string; status: "failed" | "timeout"; error: string; sources: SearchResult[] };

interface DispatchContext {
  apiKey: string;
  userId: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Zeitbudget von ${ms}ms überschritten`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runSingleAgent<T>(spec: AgentSpec<T>, ctx: DispatchContext): Promise<AgentRunResult<T>> {
  const maxSearches = spec.maxSearches ?? 4;
  let searchCount = 0;
  const sources: SearchResult[] = [];
  let messages: ORMessage[] = [{ role: "user", content: spec.instructions }];

  // Freie Tool-Runden: der Sub-Agent darf bis zu maxSearches Mal search_web
  // aufrufen, bevor die finale strukturierte Extraktion erzwungen wird.
  for (let round = 0; round < maxSearches + 1; round++) {
    const canSearch = searchCount < maxSearches;
    const result = await chatCompletion({
      apiKey: ctx.apiKey,
      userId: ctx.userId,
      taskType: spec.taskType,
      messages,
      tools: canSearch ? [searchWebToolDefinition] : undefined,
    });

    if (result.toolCalls.length === 0) {
      messages = [...messages, { role: "assistant", content: result.content ?? "" }];
      break;
    }

    messages = [...messages, { role: "assistant", content: result.content ?? "", tool_calls: result.toolCalls }];
    for (const call of result.toolCalls) {
      if (call.type !== "function" || call.function.name !== "search_web") continue;
      searchCount += 1;
      let query = "";
      try {
        query = (JSON.parse(call.function.arguments || "{}") as { query?: string }).query ?? "";
      } catch {
        // Ungültiges JSON vom Modell — leere Anfrage überspringen statt abzustürzen.
      }
      const { results } = query
        ? await searchWeb({ query, userId: ctx.userId, apiKey: ctx.apiKey })
        : { results: [] };
      sources.push(...results);
      messages = [...messages, { role: "tool", content: JSON.stringify(results), tool_call_id: call.id }];
    }
  }

  const final = await chatCompletion({
    apiKey: ctx.apiKey,
    userId: ctx.userId,
    taskType: spec.taskType,
    messages: [
      ...messages,
      { role: "user", content: "Fasse dein Ergebnis jetzt vollständig im vorgegebenen JSON-Format zusammen." },
    ],
    responseFormat: { type: "json_schema", json_schema: { name: spec.name, schema: spec.jsonSchema } },
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(final.content ?? "{}");
  } catch {
    return { name: spec.name, status: "failed", error: "Antwort war kein gültiges JSON.", sources };
  }

  const parsed = spec.schema.safeParse(parsedJson);
  if (!parsed.success) {
    return { name: spec.name, status: "failed", error: "Schema-Validierung fehlgeschlagen.", sources };
  }
  return { name: spec.name, status: "ok", data: parsed.data, sources };
}

/**
 * Dispatcht mehrere Sub-Agenten parallel. Ein einzelner Fehlschlag/Timeout
 * kippt den Gesamtlauf nicht — die Synthese arbeitet einfach mit den
 * verbliebenen erfolgreichen Ergebnissen weiter.
 */
export async function runAgents(
  specs: AgentSpec<unknown>[],
  ctx: DispatchContext,
  onProgress?: (done: number, total: number, agentName: string) => void
): Promise<AgentRunResult<unknown>[]> {
  const total = specs.length;
  let done = 0;

  const runs = specs.map(async (spec) => {
    try {
      const result = await withTimeout(runSingleAgent(spec, ctx), spec.timeoutMs ?? 90_000);
      done += 1;
      onProgress?.(done, total, spec.name);
      return result;
    } catch (err) {
      done += 1;
      onProgress?.(done, total, spec.name);
      return {
        name: spec.name,
        status: "timeout" as const,
        error: err instanceof Error ? err.message : "Unbekannter Fehler.",
        sources: [],
      };
    }
  });

  return Promise.all(runs);
}
