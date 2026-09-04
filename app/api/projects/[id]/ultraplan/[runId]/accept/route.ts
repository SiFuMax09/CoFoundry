import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems, phases, ultraplanRuns } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { publishCanvasEvent } from "@/lib/events";
import { placeDefault, type Rect } from "@/lib/canvas/layout";
import { ultraplanProposalSchema } from "@/lib/ai/ultraplan/orchestrator";

// Übernimmt einen vorgeschlagenen Ultraplan-Vorschlag: legt die Phasen und
// vorbereiteten Startkarten tatsächlich an, schließt Phase 0 ab. Erst nach
// diesem expliziten Klick sieht der Nutzer die fertig bestückte Canvas.
export async function POST(
  _request: NextRequest,
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
  if (run.status !== "proposed") {
    return NextResponse.json({ error: "Dieser Vorschlag wurde bereits übernommen oder ist ungültig." }, { status: 409 });
  }
  if (!run.proposalJson) {
    return NextResponse.json({ error: "Kein Vorschlag vorhanden." }, { status: 409 });
  }

  const proposal = ultraplanProposalSchema.parse(JSON.parse(run.proposalJson));

  const phase0 = db
    .select()
    .from(phases)
    .where(eq(phases.projectId, projectId))
    .orderBy(phases.order)
    .get();
  const maxOrderRow = db
    .select({ maxOrder: max(phases.order) })
    .from(phases)
    .where(eq(phases.projectId, projectId))
    .get();
  const baseOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

  const newPhaseIds: string[] = [];
  const newItemIds: string[] = [];

  db.transaction((tx) => {
    if (phase0) {
      tx.update(phases).set({ status: "done" }).where(eq(phases.id, phase0.id)).run();
    }

    proposal.phases.forEach((p, index) => {
      const phaseId = newId("phase");
      newPhaseIds.push(phaseId);
      tx.insert(phases)
        .values({
          id: phaseId,
          projectId,
          title: p.title,
          goal: p.goal,
          brief: p.brief,
          status: index === 0 ? "active" : "todo",
          order: baseOrder + index,
        })
        .run();
    });

    const placed: Rect[] = [];

    if (phase0) {
      const { x, y } = placeDefault(placed);
      const briefingId = newId("item");
      const width = 320;
      const height = 260;
      placed.push({ x, y, width, height });
      newItemIds.push(briefingId);
      tx.insert(canvasItems)
        .values({
          id: briefingId,
          projectId,
          phaseId: phase0.id,
          type: "document",
          title: proposal.briefing_document.title,
          content: proposal.briefing_document.content,
          x,
          y,
          width,
          height,
        })
        .run();
    }

    for (const card of proposal.starter_cards) {
      const targetPhaseId = newPhaseIds[card.phase_index] ?? newPhaseIds[0];
      if (!targetPhaseId) continue;
      const width = card.type === "note" ? 220 : 280;
      const height = card.type === "note" ? 180 : 200;
      const { x, y } = placeDefault(placed);
      placed.push({ x, y, width, height });
      const itemId = newId("item");
      newItemIds.push(itemId);
      tx.insert(canvasItems)
        .values({
          id: itemId,
          projectId,
          phaseId: targetPhaseId,
          type: card.type,
          title: card.title,
          content: card.content,
          color: card.type === "note" ? (card.color ?? "#EDE9FB") : null,
          x,
          y,
          width,
          height,
        })
        .run();
    }

    tx.update(ultraplanRuns).set({ status: "accepted" }).where(eq(ultraplanRuns.id, runId)).run();
  });

  // Live-Update für offene Canvas-Tabs.
  if (phase0) {
    const updatedPhase0 = db.select().from(phases).where(eq(phases.id, phase0.id)).get();
    publishCanvasEvent(projectId, { type: "phase_updated", phase: updatedPhase0 });
  }
  const createdPhases = newPhaseIds.map((phaseId) => {
    const phase = db.select().from(phases).where(eq(phases.id, phaseId)).get();
    publishCanvasEvent(projectId, { type: "phase_updated", phase });
    return phase;
  });
  const createdItems = newItemIds.map((itemId) => {
    const item = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
    publishCanvasEvent(projectId, { type: "item_created", item });
    return item;
  });

  return NextResponse.json({ phases: createdPhases, items: createdItems });
}
