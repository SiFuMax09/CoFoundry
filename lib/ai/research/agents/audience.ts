import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const audienceSchema = z.object({
  personas: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        needs: z.string(),
      })
    )
    .max(5),
  summary: z.string(),
});
export type AudienceResult = z.infer<typeof audienceSchema>;

export function buildAudienceAgent(subQuestion: string): AgentSpec<AudienceResult> {
  return {
    name: "audience",
    taskType: "research_subagent",
    schema: audienceSchema,
    maxSearches: 3,
    instructions: `Du bist der Zielgruppen-Agent eines Research-Dispatches. Recherchefrage: ${subQuestion}

Entwickle 2-4 knappe Personas mit ihrem zentralen Bedarf. Nutze search_web bei Bedarf (max. 3 Aufrufe), um typisches Nutzerverhalten/Bedürfnisse dieser Zielgruppe zu verifizieren.`,
    jsonSchema: {
      type: "object",
      properties: {
        personas: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, description: { type: "string" }, needs: { type: "string" } },
            required: ["name", "description", "needs"],
          },
        },
        summary: { type: "string" },
      },
      required: ["personas", "summary"],
    },
  };
}
