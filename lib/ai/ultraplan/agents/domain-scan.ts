import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const domainScanSchema = z.object({
  competitors: z.array(z.object({ name: z.string(), description: z.string() })).max(6),
  market_notes: z.string(),
});
export type DomainScanResult = z.infer<typeof domainScanSchema>;

export function buildDomainScanAgent(briefing: string): AgentSpec<DomainScanResult> {
  return {
    name: "domain_scan",
    taskType: "ultraplan_subagent",
    schema: domainScanSchema,
    maxSearches: 4,
    instructions: `Du bist der Domain-Scan-Agent eines Ultraplan-Dispatches. Aufgabe: schneller Markt-/Konkurrenz-Überblick für folgendes Projekt-Briefing.

${briefing}

Nutze search_web gezielt (max. 4 Aufrufe), um die wichtigsten 3-6 Konkurrenzprodukte/-anbieter zu finden. Halte dich strikt an dein Budget.`,
    jsonSchema: {
      type: "object",
      properties: {
        competitors: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, description: { type: "string" } },
            required: ["name", "description"],
          },
        },
        market_notes: { type: "string", description: "Kurze Einschätzung der Marktlage." },
      },
      required: ["competitors", "market_notes"],
    },
  };
}
