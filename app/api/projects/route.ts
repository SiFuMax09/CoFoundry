import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { phases, projects } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { requireUser } from "@/lib/auth";
import { listProjectsForUser } from "@/lib/projects";

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  return NextResponse.json({ projects: listProjectsForUser(auth.user.id) });
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Projektnamen angeben.").max(200),
  onboarding: z.record(z.string(), z.unknown()).optional(),
});

// Legt ein Projekt IMMER zusammen mit seiner Phase 0 "Grundlagen klären" an
// (order 0, status active) — die beiden gehören untrennbar zusammen, siehe
// Onboarding-Kapitel. Der Wizard ruft diese Route auf.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 }
    );
  }

  const projectId = newId("project");
  const phaseId = newId("phase");

  db.transaction((tx) => {
    tx.insert(projects)
      .values({
        id: projectId,
        userId: auth.user.id,
        name: parsed.data.name,
        onboardingJson: parsed.data.onboarding ? JSON.stringify(parsed.data.onboarding) : null,
      })
      .run();

    tx.insert(phases)
      .values({
        id: phaseId,
        projectId,
        title: "Grundlagen klären",
        goal: "Die Idee, das Warum und die Ausgangslage klären, bevor Ultraplan die Roadmap erzeugt.",
        status: "active",
        order: 0,
      })
      .run();
  });

  return NextResponse.json({ project: { id: projectId, name: parsed.data.name }, phaseId }, { status: 201 });
}
