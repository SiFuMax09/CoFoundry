import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems, canvasItemTypeValues } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { listCanvasItemsForProject } from "@/lib/canvas-items";
import { publishCanvasEvent } from "@/lib/events";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  return NextResponse.json({ items: listCanvasItemsForProject(id) });
}

// Manuelles Anlegen über den +-Button (nicht die Agent-Tools aus lib/ai/tools.ts,
// auch wenn beide dieselbe Tabelle beschreiben).
const createItemSchema = z.object({
  phaseId: z.string().nullable().optional(),
  type: z.enum(canvasItemTypeValues),
  title: z.string().trim().min(1).max(300),
  content: z.string().max(200_000).optional(),
  color: z.string().max(32).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 }
    );
  }

  const itemId = newId("item");
  db.insert(canvasItems)
    .values({
      id: itemId,
      projectId: id,
      phaseId: parsed.data.phaseId ?? null,
      type: parsed.data.type,
      title: parsed.data.title,
      content: parsed.data.content ?? "",
      color: parsed.data.color,
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width ?? 280,
      height: parsed.data.height ?? 200,
    })
    .run();

  const item = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
  publishCanvasEvent(id, { type: "item_created", item });

  return NextResponse.json({ item }, { status: 201 });
}
