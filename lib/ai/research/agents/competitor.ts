import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const competitorSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        strengths: z.string(),
        weaknesses: z.string(),
      })
    )
    .max(6),
  summary: z.string(),
});
export type CompetitorResult = z.infer<typeof competitorSchema>;

export function buildCompetitorAgent(subQuestion: string): AgentSpec<CompetitorResult> {
  return {
    name: "competitor",
    taskType: "research_subagent",
    schema: competitorSchema,
    maxSearches: 4,
    instructions: `Du bist der Wettbewerbs-Agent eines Research-Dispatches. Recherchefrage: ${subQuestion}

Nutze search_web gezielt (max. 4 Aufrufe), um die relevantesten Konkurrenzprodukte/-anbieter zu finden und knapp zu bewerten (Stärken/Schwächen).`,
    jsonSchema: {
      type: "object",
      properties: {
        competitors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              strengths: { type: "string" },
              weaknesses: { type: "string" },
            },
            required: ["name", "description", "strengths", "weaknesses"],
          },
        },
        summary: { type: "string" },
      },
      required: ["competitors", "summary"],
    },
  };
}
