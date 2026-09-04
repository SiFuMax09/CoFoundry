import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { phases, phaseStatusValues } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedPhase } from "@/lib/phases";
import { publishCanvasEvent } from "@/lib/events";

const updatePhaseSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  goal: z.string().max(2000).optional(),
  brief: z.string().max(4000).optional(),
  status: z.enum(phaseStatusValues).optional(),
  order: z.number().int().optional(),
  systemPromptOverride: z.string().max(8000).nullable().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedPhase(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Phase nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updatePhaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen übergeben." }, { status: 400 });
  }

  db.update(phases).set(parsed.data).where(eq(phases.id, id)).run();
  const updated = db.select().from(phases).where(eq(phases.id, id)).get();

  publishCanvasEvent(owned.project.id, { type: "phase_updated", phase: updated });

  return NextResponse.json({ phase: updated });
}
