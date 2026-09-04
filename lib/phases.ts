import { eq } from "drizzle-orm";
import { db } from "./db";
import { phases, projects } from "./db/schema";

/** Lädt eine Phase nur, wenn ihr Projekt dem angegebenen Nutzer gehört. */
export function getOwnedPhase(phaseId: string, userId: string) {
  const phase = db.select().from(phases).where(eq(phases.id, phaseId)).get();
  if (!phase) return null;
  const project = db.select().from(projects).where(eq(projects.id, phase.projectId)).get();
  if (!project || project.userId !== userId) return null;
  return { phase, project };
}

export function listPhasesForProject(projectId: string) {
  return db.select().from(phases).where(eq(phases.projectId, projectId)).orderBy(phases.order).all();
}
