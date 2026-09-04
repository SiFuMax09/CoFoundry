import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { ultraplanRuns } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { buildProjectBriefing } from "@/lib/ai/ultraplan/briefing";
import { runUltraplanDispatch } from "@/lib/ai/ultraplan/orchestrator";

export const dynamic = "force-dynamic";

// Startet den Ultraplan-Dispatch (Sub-Agenten-Auswahl → parallele
// Sub-Agenten → Synthese) und streamt den Fortschritt. Wird nur durch den
// expliziten Klick auf "Ultraplan starten" in der Phase-0-Bestätigungskarte
// ausgelöst — hier wird bereits echtes Geld über den OpenRouter-Key
// ausgegeben.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id: projectId } = await params;

  const project = getOwnedProject(projectId, auth.user.id);
  if (!project) return Response.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const apiKey = getDecryptedApiKey(auth.user.id);
  if (!apiKey) {
    return Response.json(
      { error: "Kein OpenRouter-Key hinterlegt. Bitte zuerst unter /settings einen Key eintragen.", needsApiKey: true },
      { status: 400 }
    );
  }

  const briefing = buildProjectBriefing(projectId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const dispatchResult = await runUltraplanDispatch(
          briefing,
          { apiKey, userId: auth.user.id },
          (done, total, agentName) => {
            send({ type: "agent_progress", done, total, agentName });
          }
        );

        const runId = newId("ultraplan");
        db.insert(ultraplanRuns)
          .values({
            id: runId,
            projectId,
            status: "proposed",
            briefingJson: JSON.stringify({ briefing: dispatchResult.briefing }),
            agentResultsJson: JSON.stringify(dispatchResult.agentResults),
            proposalJson: JSON.stringify(dispatchResult.proposal),
          })
          .run();

        send({ type: "proposal", runId, proposal: dispatchResult.proposal });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Ultraplan-Dispatch fehlgeschlagen." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
