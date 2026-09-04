import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const resourceGapSchema = z.object({
  available_skills: z.array(z.string()).max(10),
  needed_skills: z.array(z.string()).max(10),
  gaps: z.array(z.string()).max(10),
});
export type ResourceGapResult = z.infer<typeof resourceGapSchema>;

export function buildResourceGapAgent(briefing: string): AgentSpec<ResourceGapResult> {
  return {
    name: "resource_gap",
    taskType: "ultraplan_subagent",
    schema: resourceGapSchema,
    maxSearches: 2,
    instructions: `Du bist der Resource-Gap-Agent eines Ultraplan-Dispatches. Aufgabe: gleiche die im Briefing genannten Ressourcen/Skills des Gründers mit dem ab, was das Vorhaben vermutlich braucht, und markiere Lücken.

${briefing}

Websuche nur, wenn unklar ist, welche Skills ein Vorhaben dieser Art typischerweise braucht (max. 2 Aufrufe).`,
    jsonSchema: {
      type: "object",
      properties: {
        available_skills: { type: "array", items: { type: "string" } },
        needed_skills: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
      },
      required: ["available_skills", "needed_skills", "gaps"],
    },
  };
}
