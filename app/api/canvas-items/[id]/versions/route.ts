import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItemVersions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedCanvasItem } from "@/lib/canvas-items";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedCanvasItem(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Element nicht gefunden." }, { status: 404 });

  const versions = db
    .select()
    .from(canvasItemVersions)
    .where(eq(canvasItemVersions.itemId, id))
    .orderBy(desc(canvasItemVersions.createdAt))
    .all();

  return NextResponse.json({ versions });
}
