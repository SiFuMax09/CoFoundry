import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems, canvasItemStatusValues } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedCanvasItem } from "@/lib/canvas-items";
import { publishCanvasEvent } from "@/lib/events";
import { applyCanvasItemUpdate } from "@/lib/canvas/versions";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedCanvasItem(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Element nicht gefunden." }, { status: 404 });

  return NextResponse.json({ item: owned.item });
}

// Deckt sowohl das manuelle Verschieben im UI (nur x/y/width/height) als
// auch inhaltliche Bearbeitung durch den Nutzer ab. Läuft unabhängig von den
// Agent-Tools über einen eigenen Endpunkt — der Agent setzt nie eine vom
// Nutzer manuell verschobene Position zurück, weil er diese Route nie ruft.
const updateItemSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().max(200_000).optional(),
  color: z.string().max(32).nullable().optional(),
  status: z.enum(canvasItemStatusValues).nullable().optional(),
  phaseId: z.string().nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedCanvasItem(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Element nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben." }, { status: 400 });
  }

  // Manuelle Bearbeitung im UI zählt immer als "user" — der Agent nutzt
  // seinen eigenen Tool-Pfad (update_canvas_item, task 8), nie diese Route.
  const updated = applyCanvasItemUpdate(id, parsed.data, "user");
  publishCanvasEvent(owned.project.id, { type: "item_updated", item: updated });

  return NextResponse.json({ item: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedCanvasItem(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Element nicht gefunden." }, { status: 404 });

  db.delete(canvasItems).where(eq(canvasItems.id, id)).run();
  publishCanvasEvent(owned.project.id, { type: "item_deleted", itemId: id });

  return NextResponse.json({ ok: true });
}
