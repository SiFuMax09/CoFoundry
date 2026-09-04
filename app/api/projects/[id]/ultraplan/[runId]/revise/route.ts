import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ultraplanRuns } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { reviseUltraplanProposal } from "@/lib/ai/ultraplan/orchestrator";
import type { AgentRunResult } from "@/lib/ai/agents/dispatch";

const bodySchema = z.object({ instruction: z.string().min(1).max(2000) });

// Günstiger Re-Synthese-Lauf für "Anpassen" — arbeitet auf den bereits
// gespeicherten Sub-Agenten-Ergebnissen, ohne sie (und ihre Websuchen)
// erneut zu bezahlen.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id: projectId, runId } = await params;

  const project = getOwnedProject(projectId, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const run = db.select().from(ultraplanRuns).where(eq(ultraplanRuns.id, runId)).get();
  if (!run || run.projectId !== projectId) {
    return NextResponse.json({ error: "Ultraplan-Lauf nicht gefunden." }, { status: 404 });
  }
  if (run.status !== "proposed" || !run.agentResultsJson) {
    return NextResponse.json({ error: "Dieser Lauf kann nicht mehr angepasst werden." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });

  const apiKey = getDecryptedApiKey(auth.user.id);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Kein OpenRouter-Key hinterlegt.", needsApiKey: true },
      { status: 400 }
    );
  }

  const briefing = (JSON.parse(run.briefingJson) as { briefing: string }).briefing;
  const agentResults = JSON.parse(run.agentResultsJson) as AgentRunResult<unknown>[];

  const proposal = await reviseUltraplanProposal(briefing, agentResults, parsed.data.instruction, {
    apiKey,
    userId: auth.user.id,
  });

  db.update(ultraplanRuns).set({ proposalJson: JSON.stringify(proposal) }).where(eq(ultraplanRuns.id, runId)).run();

  return NextResponse.json({ proposal });
}
