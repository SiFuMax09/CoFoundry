import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const feasibilitySchema = z.object({
  tech_stack: z.array(z.string()).max(10),
  feasibility_notes: z.string(),
  risks: z.array(z.string()).max(6),
});
export type FeasibilityResult = z.infer<typeof feasibilitySchema>;

export function buildFeasibilityAgent(briefing: string): AgentSpec<FeasibilityResult> {
  return {
    name: "feasibility",
    taskType: "ultraplan_subagent",
    schema: feasibilitySchema,
    maxSearches: 4,
    instructions: `Du bist der Feasibility-Agent eines Ultraplan-Dispatches. Aufgabe: technische Machbarkeit einschätzen und einen passenden Tech-Stack vorschlagen, angesichts der im Briefing genannten Skills/Ressourcen.

${briefing}

Nutze search_web bei Bedarf (max. 4 Aufrufe), um aktuelle, passende Tools/Frameworks zu prüfen.`,
    jsonSchema: {
      type: "object",
      properties: {
        tech_stack: { type: "array", items: { type: "string" }, description: "Vorgeschlagene Technologien." },
        feasibility_notes: { type: "string" },
        risks: { type: "array", items: { type: "string" } },
      },
      required: ["tech_stack", "feasibility_notes", "risks"],
    },
  };
}
