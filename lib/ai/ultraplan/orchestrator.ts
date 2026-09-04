import { z } from "zod";
import { chatCompletion } from "@/lib/ai/openrouter";
import { runAgents, type AgentRunResult, type AgentSpec } from "@/lib/ai/agents/dispatch";
import { buildDomainScanAgent } from "./agents/domain-scan";
import { buildFeasibilityAgent } from "./agents/feasibility";
import { buildResourceGapAgent } from "./agents/resource-gap";
import { buildRiskScanAgent } from "./agents/risk-scan";

const AGENT_POOL = ["domain_scan", "feasibility", "resource_gap", "risk_scan"] as const;
type AgentName = (typeof AGENT_POOL)[number];

const selectionSchema = z.object({
  selected_agents: z.array(z.enum(AGENT_POOL)).min(1).max(4),
});

/**
 * Wählt aus dem Kandidaten-Pool die für dieses Projekt sinnvolle Teilmenge
 * an Sub-Agenten — kein fixes Set, siehe Ultraplan-Kapitel. Ein Modell-
 * Fehlschlag fällt sicher auf "alle vier" zurück statt den Dispatch zu
 * blockieren.
 */
async function selectAgents(briefing: string, ctx: { apiKey: string; userId: string }): Promise<AgentName[]> {
  const result = await chatCompletion({
    apiKey: ctx.apiKey,
    userId: ctx.userId,
    taskType: "ultraplan_orchestrator",
    messages: [
      {
        role: "user",
        content: `Wähle für folgendes Projekt-Briefing die sinnvollen Recherche-/Analyse-Sub-Agenten aus dem Pool [${AGENT_POOL.join(", ")}]. Wähle nur, was für DIESES Vorhaben Substanz liefert (z. B. resource_gap nur, wenn Skills/Ressourcen im Briefing überhaupt thematisiert wurden).\n\n${briefing}`,
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "agent_selection",
        schema: {
          type: "object",
          properties: {
            selected_agents: { type: "array", items: { type: "string", enum: AGENT_POOL } },
          },
          required: ["selected_agents"],
        },
      },
    },
  });

  try {
    const parsed = selectionSchema.safeParse(JSON.parse(result.content ?? "{}"));
    if (parsed.success && parsed.data.selected_agents.length > 0) return parsed.data.selected_agents;
  } catch {
    // Fällt unten auf den vollen Pool zurück.
  }
  return [...AGENT_POOL];
}

function buildAgentSpecs(names: AgentName[], briefing: string): AgentSpec<unknown>[] {
  return names.map((name): AgentSpec<unknown> => {
    switch (name) {
      case "domain_scan":
        return buildDomainScanAgent(briefing);
      case "feasibility":
        return buildFeasibilityAgent(briefing);
      case "resource_gap":
        return buildResourceGapAgent(briefing);
      case "risk_scan":
        return buildRiskScanAgent(briefing);
    }
  });
}

const phaseProposalSchema = z.object({ title: z.string(), goal: z.string(), brief: z.string() });
const starterCardSchema = z.object({
  phase_index: z.number().int().min(0),
  type: z.enum(["note", "document"]),
  title: z.string(),
  content: z.string(),
  color: z.string().optional(),
});
export const ultraplanProposalSchema = z.object({
  phases: z.array(phaseProposalSchema).min(1).max(8),
  starter_cards: z.array(starterCardSchema).max(24),
  briefing_document: z.object({ title: z.string(), content: z.string() }),
});
export type UltraplanProposal = z.infer<typeof ultraplanProposalSchema>;

const proposalJsonSchema = {
  type: "object",
  properties: {
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, goal: { type: "string" }, brief: { type: "string" } },
        required: ["title", "goal", "brief"],
      },
    },
    starter_cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phase_index: { type: "integer", description: "0-basierter Index in `phases`." },
          type: { type: "string", enum: ["note", "document"] },
          title: { type: "string" },
          content: { type: "string" },
          color: { type: "string" },
        },
        required: ["phase_index", "type", "title", "content"],
      },
    },
    briefing_document: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" } },
      required: ["title", "content"],
    },
  },
  required: ["phases", "starter_cards", "briefing_document"],
};

function formatAgentResultsForPrompt(results: AgentRunResult<unknown>[]): string {
  return results
    .map((r) => {
      if (r.status === "ok") {
        return `### ${r.name} (erfolgreich)\n${JSON.stringify(r.data, null, 2)}\nQuellen: ${r.sources.map((s) => s.url).join(", ") || "keine"}`;
      }
      return `### ${r.name} (fehlgeschlagen: ${r.error})`;
    })
    .join("\n\n");
}

async function synthesize(
  briefing: string,
  agentResults: AgentRunResult<unknown>[],
  instruction: string | undefined,
  ctx: { apiKey: string; userId: string }
): Promise<UltraplanProposal> {
  const result = await chatCompletion({
    apiKey: ctx.apiKey,
    userId: ctx.userId,
    taskType: "ultraplan_orchestrator",
    messages: [
      {
        role: "user",
        content: `Erzeuge aus dem Projekt-Briefing und den Sub-Agenten-Ergebnissen eine Phasen-Roadmap (3-6 Phasen, thematisch aufeinander aufbauend) samt vorbereiteten Startkarten je Phase (Notizen/Dokumente, aus den Rohergebnissen destilliert — nicht 1:1 durchreichen) und einem "Projekt-Briefing"-Dokument, das die Wizard-Antworten und die Essenz des Phase-0-Chats für den Nutzer sichtbar zusammenfasst.

${briefing}

## Sub-Agenten-Ergebnisse
${formatAgentResultsForPrompt(agentResults)}
${instruction ? `\n## Anpassungswunsch des Nutzers\n${instruction}` : ""}`,
      },
    ],
    responseFormat: { type: "json_schema", json_schema: { name: "ultraplan_proposal", schema: proposalJsonSchema } },
  });

  const parsed = ultraplanProposalSchema.parse(JSON.parse(result.content ?? "{}"));
  return parsed;
}

export interface UltraplanDispatchResult {
  briefing: string;
  agentResults: AgentRunResult<unknown>[];
  proposal: UltraplanProposal;
}

/** Kompletter Dispatch: Auswahl → parallele Sub-Agenten → Synthese. */
export async function runUltraplanDispatch(
  briefing: string,
  ctx: { apiKey: string; userId: string },
  onProgress?: (done: number, total: number, agentName: string) => void
): Promise<UltraplanDispatchResult> {
  const selected = await selectAgents(briefing, ctx);
  const specs = buildAgentSpecs(selected, briefing);
  const agentResults = await runAgents(specs, ctx, onProgress);
  const proposal = await synthesize(briefing, agentResults, undefined, ctx);
  return { briefing, agentResults, proposal };
}

/** Günstiger Re-Synthese-Lauf für "Anpassen" — ohne die Sub-Agenten erneut zu dispatchen. */
export async function reviseUltraplanProposal(
  briefing: string,
  agentResults: AgentRunResult<unknown>[],
  instruction: string,
  ctx: { apiKey: string; userId: string }
): Promise<UltraplanProposal> {
  return synthesize(briefing, agentResults, instruction, ctx);
}
