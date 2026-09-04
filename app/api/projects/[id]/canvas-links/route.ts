import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems, canvasLinks } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { publishCanvasEvent } from "@/lib/events";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const itemIds = db
    .select({ id: canvasItems.id })
    .from(canvasItems)
    .where(eq(canvasItems.projectId, id))
    .all()
    .map((r) => r.id);

  if (itemIds.length === 0) return NextResponse.json({ links: [] });

  const links = db.select().from(canvasLinks).where(inArray(canvasLinks.fromItemId, itemIds)).all();
  return NextResponse.json({ links });
}

const createLinkSchema = z.object({
  fromItemId: z.string(),
  toItemId: z.string(),
  relationLabel: z.string().max(200).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const linkId = newId("link");
  db.insert(canvasLinks)
    .values({
      id: linkId,
      fromItemId: parsed.data.fromItemId,
      toItemId: parsed.data.toItemId,
      relationLabel: parsed.data.relationLabel ?? "",
    })
    .run();

  const link = db.select().from(canvasLinks).where(eq(canvasLinks.id, linkId)).get();
  publishCanvasEvent(id, { type: "link_created", link });

  return NextResponse.json({ link }, { status: 201 });
}
