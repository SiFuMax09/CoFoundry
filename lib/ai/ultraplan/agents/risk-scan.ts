import { z } from "zod";
import type { AgentSpec } from "@/lib/ai/agents/dispatch";

export const riskScanSchema = z.object({
  risks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        severity: z.enum(["low", "medium", "high"]),
      })
    )
    .max(6),
});
export type RiskScanResult = z.infer<typeof riskScanSchema>;

export function buildRiskScanAgent(briefing: string): AgentSpec<RiskScanResult> {
  return {
    name: "risk_scan",
    taskType: "ultraplan_subagent",
    schema: riskScanSchema,
    maxSearches: 3,
    instructions: `Du bist der Risk-Scan-Agent eines Ultraplan-Dispatches. Aufgabe: grobe regulatorische/marktliche Risiken für folgendes Vorhaben identifizieren.

${briefing}

Nutze search_web bei Bedarf (max. 3 Aufrufe), z. B. für branchenspezifische regulatorische Fragen.`,
    jsonSchema: {
      type: "object",
      properties: {
        risks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title", "description", "severity"],
          },
        },
      },
      required: ["risks"],
    },
  };
}
