import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { phases, projects } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
  }

  const projectPhases = db
    .select()
    .from(phases)
    .where(eq(phases.projectId, id))
    .orderBy(phases.order)
    .all();

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      onboarding: project.onboardingJson ? JSON.parse(project.onboardingJson) : null,
      createdAt: project.createdAt,
    },
    phases: projectPhases,
  });
}

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  if (parsed.data.name) {
    db.update(projects).set({ name: parsed.data.name }).where(eq(projects.id, id)).run();
  }

  return NextResponse.json({ ok: true });
}
