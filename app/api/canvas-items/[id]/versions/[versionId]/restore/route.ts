import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItemVersions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedCanvasItem } from "@/lib/canvas-items";
import { applyCanvasItemUpdate } from "@/lib/canvas/versions";
import { publishCanvasEvent } from "@/lib/events";

// Setzt Titel/Inhalt eines Items auf eine frühere Version zurück. Das
// überschreibt den aktuellen Stand nicht kommentarlos — applyCanvasItemUpdate
// legt dabei selbst wieder eine neue Version an (der jetzige Stand geht also
// nicht verloren, sondern wird ebenfalls Teil der Historie).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id, versionId } = await params;

  const owned = getOwnedCanvasItem(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Element nicht gefunden." }, { status: 404 });

  const version = db
    .select()
    .from(canvasItemVersions)
    .where(eq(canvasItemVersions.id, versionId))
    .get();
  if (!version || version.itemId !== id) {
    return NextResponse.json({ error: "Version nicht gefunden." }, { status: 404 });
  }

  const updated = applyCanvasItemUpdate(id, { title: version.title, content: version.content }, "user");
  publishCanvasEvent(owned.project.id, { type: "item_updated", item: updated });

  return NextResponse.json({ item: updated });
}
