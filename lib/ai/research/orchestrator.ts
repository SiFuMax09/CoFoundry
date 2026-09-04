import { z } from "zod";
import { chatCompletion } from "@/lib/ai/openrouter";
import { runAgents, type AgentRunResult, type AgentSpec } from "@/lib/ai/agents/dispatch";
import { buildCompetitorAgent } from "./agents/competitor";
import { buildAudienceAgent } from "./agents/audience";
import { buildMarketRiskAgent } from "./agents/market-risk";

/**
 * Research-Multi-Agent-System: Orchestrator zerlegt die Fragestellung in
 * drei fachlich zugeschnittene Recherche-Fragen (anders als Ultraplan
 * IMMER alle drei Rollen — Wettbewerb, Zielgruppe, Markt/Risiko sind für
 * jede Recherche-Frage relevant, es gibt hier keine dynamische Auswahl).
 * Folgt demselben Dispatch-/Synthese-Muster wie Ultraplan
 * (lib/ai/agents/dispatch.ts) — siehe docs/agent-architecture.md.
 */

const decompositionSchema = z.object({
  competitor_question: z.string(),
  audience_question: z.string(),
  market_risk_question: z.string(),
});

async function decomposeQuestion(
  question: string,
  ctx: { apiKey: string; userId: string }
): Promise<z.infer<typeof decompositionSchema>> {
  const result = await chatCompletion({
    apiKey: ctx.apiKey,
    userId: ctx.userId,
    taskType: "research_synthesis",
    messages: [
      {
        role: "user",
        content: `Zerlege folgende Recherche-Frage in drei zugeschnittene Teilfragen für spezialisierte Agenten (Wettbewerb, Zielgruppe, Markt/Risiko). Jede Teilfrage soll konkret und für ihren Agenten direkt bearbeitbar sein.\n\nFrage: ${question}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "research_decomposition",
        schema: {
          type: "object",
          properties: {
            competitor_question: { type: "string" },
            audience_question: { type: "string" },
            market_risk_question: { type: "string" },
          },
          required: ["competitor_question", "audience_question", "market_risk_question"],
        },
      },
    },
  });
  return decompositionSchema.parse(JSON.parse(result.content ?? "{}"));
}

export interface ResearchDocument {
  title: string;
  content_markdown: string;
}

async function synthesize(
  question: string,
  agentResults: AgentRunResult<unknown>[],
  ctx: { apiKey: string; userId: string }
): Promise<ResearchDocument> {
  const formatted = agentResults
    .map((r) => {
      if (r.status === "ok") {
        return `### ${r.name}\n${JSON.stringify(r.data, null, 2)}\nQuellen: ${
          r.sources.map((s) => `[${s.title}](${s.url})`).join(", ") || "keine"
        }`;
      }
      return `### ${r.name} (fehlgeschlagen: ${r.error})`;
    })
    .join("\n\n");

  const result = await chatCompletion({
    apiKey: ctx.apiKey,
    userId: ctx.userId,
    taskType: "research_synthesis",
    messages: [
      {
        role: "user",
        content: `Führe die folgenden Recherche-Ergebnisse zu einem zitierten Markdown-Dokument zusammen, das die Ausgangsfrage beantwortet. Nenne Quellen als Markdown-Links direkt im Text, nicht nur am Ende. Struktur: kurze Zusammenfassung, dann Abschnitte je Themenfeld (Wettbewerb, Zielgruppe, Markt & Risiken).

Ausgangsfrage: ${question}

## Rohergebnisse der Sub-Agenten
${formatted}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "research_document",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content_markdown: { type: "string" },
          },
          required: ["title", "content_markdown"],
        },
      },
    },
  });

  return z
    .object({ title: z.string(), content_markdown: z.string() })
    .parse(JSON.parse(result.content ?? "{}"));
}

export interface ResearchDispatchResult {
  document: ResearchDocument;
  agentResults: AgentRunResult<unknown>[];
}

export async function runResearchDispatch(
  question: string,
  ctx: { apiKey: string; userId: string },
  onProgress?: (done: number, total: number, agentName: string) => void
): Promise<ResearchDispatchResult> {
  const decomposed = await decomposeQuestion(question, ctx);

  const specs: AgentSpec<unknown>[] = [
    buildCompetitorAgent(decomposed.competitor_question),
    buildAudienceAgent(decomposed.audience_question),
    buildMarketRiskAgent(decomposed.market_risk_question),
  ];

  const agentResults = await runAgents(specs, ctx, onProgress);
  const document = await synthesize(question, agentResults, ctx);

  return { document, agentResults };
}
