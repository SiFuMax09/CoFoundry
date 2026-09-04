import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { canvasItems, phases, projects } from "./db/schema";

/** Lädt ein Projekt nur, wenn es dem angegebenen Nutzer gehört. */
export function getOwnedProject(projectId: string, userId: string) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.userId !== userId) return null;
  return project;
}

export interface ProjectPreviewItem {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: Date | null;
  lastActivityAt: string;
  phaseCount: number;
  currentPhase: { title: string; order: number } | null;
  previewItems: ProjectPreviewItem[];
}

/** Angereicherte Projektliste fürs Dashboard — von Server Component und API-Route geteilt. */
export function listProjectsForUser(userId: string): ProjectSummary[] {
  const rows = db
    .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
    .all();

  return rows.map((project) => {
    const projectPhases = db
      .select({ id: phases.id, title: phases.title, status: phases.status, order: phases.order })
      .from(phases)
      .where(eq(phases.projectId, project.id))
      .orderBy(phases.order)
      .all();

    const activePhase = projectPhases.find((p) => p.status === "active") ?? projectPhases.at(-1);

    const items = db
      .select({
        type: canvasItems.type,
        x: canvasItems.x,
        y: canvasItems.y,
        width: canvasItems.width,
        height: canvasItems.height,
        color: canvasItems.color,
        updatedAt: canvasItems.updatedAt,
      })
      .from(canvasItems)
      .where(eq(canvasItems.projectId, project.id))
      .all();

    const lastActivity = items.reduce<number>(
      (latest, item) => Math.max(latest, item.updatedAt?.getTime() ?? 0),
      project.createdAt?.getTime() ?? 0
    );

    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      lastActivityAt: new Date(lastActivity).toISOString(),
      phaseCount: projectPhases.length,
      currentPhase: activePhase ? { title: activePhase.title, order: activePhase.order } : null,
      previewItems: items.map(({ updatedAt: _updatedAt, ...rest }) => rest),
    };
  });
}
