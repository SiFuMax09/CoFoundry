import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedPhase, updatePhaseFields } from "@/lib/phases";
import { publishCanvasEvent } from "@/lib/events";
import { ACTIVE_CHAT_MODEL_OPTIONS } from "@/lib/ai/tasks";

const ALLOWED_MODELS = ACTIVE_CHAT_MODEL_OPTIONS.map((o) => o.model) as [string, ...string[]];

const bodySchema = z.object({ model: z.enum(ALLOWED_MODELS) });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedPhase(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Phase nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiges Modell." }, { status: 400 });
  }

  const updated = updatePhaseFields(id, { activeChatModel: parsed.data.model });
  publishCanvasEvent(owned.project.id, { type: "phase_updated", phase: updated });

  return NextResponse.json({ phase: updated });
}
