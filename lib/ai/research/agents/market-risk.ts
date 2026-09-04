import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const marketRiskSchema = z.object({
  market_size_estimate: z.string(),
  risks: z.array(z.object({ title: z.string(), description: z.string() })).max(6),
  regulatory_notes: z.string(),
});
export type MarketRiskResult = z.infer<typeof marketRiskSchema>;

export function buildMarketRiskAgent(subQuestion: string): AgentSpec<MarketRiskResult> {
  return {
    name: "market_risk",
    taskType: "research_subagent",
    schema: marketRiskSchema,
    maxSearches: 4,
    instructions: `Du bist der Markt-/Risiko-Agent eines Research-Dispatches. Recherchefrage: ${subQuestion}

Schätze grob die Marktgröße ein, identifiziere Risiken und regulatorische Fallstricke. Nutze search_web gezielt (max. 4 Aufrufe).`,
    jsonSchema: {
      type: "object",
      properties: {
        market_size_estimate: { type: "string" },
        risks: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, description: { type: "string" } },
            required: ["title", "description"],
          },
        },
        regulatory_notes: { type: "string" },
      },
      required: ["market_size_estimate", "risks", "regulatory_notes"],
    },
  };
}
