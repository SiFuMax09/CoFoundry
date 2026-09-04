import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { getOwnedPhase } from "@/lib/phases";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { listCanvasItemsForProject } from "@/lib/canvas-items";
import { placeDefault } from "@/lib/canvas/layout";
import { publishCanvasEvent } from "@/lib/events";
import { runResearchDispatch } from "@/lib/ai/research/orchestrator";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phaseId: z.string(),
  question: z.string().min(1).max(2000),
});

// Research-Multi-Agent-Dispatch: anders als Ultraplan gibt es keinen
// Zustimmungsschritt — der Synthese-Agent schreibt das zitierte
// Recherche-Dokument direkt auf die Canvas (siehe Research-Kapitel).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id: projectId } = await params;

  const project = getOwnedProject(projectId, auth.user.id);
  if (!project) return Response.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });

  const owned = getOwnedPhase(parsed.data.phaseId, auth.user.id);
  if (!owned || owned.project.id !== projectId) {
    return Response.json({ error: "Phase nicht gefunden." }, { status: 404 });
  }

  const apiKey = getDecryptedApiKey(auth.user.id);
  if (!apiKey) {
    return Response.json(
      { error: "Kein OpenRouter-Key hinterlegt. Bitte zuerst unter /settings einen Key eintragen.", needsApiKey: true },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const { document } = await runResearchDispatch(
          parsed.data.question,
          { apiKey, userId: auth.user.id },
          (done, total, agentName) => send({ type: "agent_progress", done, total, agentName })
        );

        const existing = listCanvasItemsForProject(projectId);
        const { x, y } = placeDefault(existing.map(({ x, y, width, height }) => ({ x, y, width, height })));
        const itemId = newId("item");
        const width = 320;
        const height = 260;

        db.insert(canvasItems)
          .values({
            id: itemId,
            projectId,
            phaseId: parsed.data.phaseId,
            type: "document",
            title: document.title,
            content: document.content_markdown,
            x,
            y,
            width,
            height,
          })
          .run();

        const item = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
        publishCanvasEvent(projectId, { type: "item_created", item });

        send({ type: "document_created", itemId, title: document.title });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Research-Dispatch fehlgeschlagen." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
