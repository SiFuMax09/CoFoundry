import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { phases } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { listPhasesForProject } from "@/lib/phases";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  return NextResponse.json({ phases: listPhasesForProject(id) });
}

const createPhaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(2000).optional(),
  brief: z.string().trim().max(4000).optional(),
});

// Legt eine neue, freie Phase ans Ende der Roadmap an — genutzt, wenn der
// Nutzer nach der letzten Phase "Roadmap erweitern" wählt.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createPhaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const maxOrderRow = db
    .select({ maxOrder: max(phases.order) })
    .from(phases)
    .where(eq(phases.projectId, id))
    .get();
  const nextOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

  const phaseId = newId("phase");
  db.insert(phases)
    .values({
      id: phaseId,
      projectId: id,
      title: parsed.data.title,
      goal: parsed.data.goal ?? "",
      brief: parsed.data.brief ?? "",
      status: "todo",
      order: nextOrder,
    })
    .run();

  return NextResponse.json({ phase: { id: phaseId } }, { status: 201 });
}
