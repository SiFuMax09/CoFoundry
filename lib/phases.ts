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

export interface PhaseFieldPatch {
  title?: string;
  goal?: string;
  brief?: string;
  status?: "todo" | "active" | "done";
  order?: number;
  systemPromptOverride?: string | null;
  activeChatModel?: string | null;
}

/** Von der PUT-Route und dem update_phase-Agent-Tool gemeinsam genutzt. */
export function updatePhaseFields(phaseId: string, patch: PhaseFieldPatch) {
  // Leeres Patch (z. B. der Agent ruft update_phase nur mit phase_id auf,
  // ohne ein Feld zu ändern) — Drizzle wirft bei .set({}) sonst "No values
  // to set".
  if (Object.keys(patch).length > 0) {
    db.update(phases).set(patch).where(eq(phases.id, phaseId)).run();
  }
  return db.select().from(phases).where(eq(phases.id, phaseId)).get();
}

/** Setzt die Bereitschafts-Markierung, die den "Bereit für Phase X?"-Hinweis
 * bzw. die Ultraplan-Bestätigungskarte in Phase 0 auslöst. */
export function setPhaseReady(phaseId: string, summary: string) {
  db.update(phases).set({ readySummary: summary, readyAt: new Date() }).where(eq(phases.id, phaseId)).run();
  return db.select().from(phases).where(eq(phases.id, phaseId)).get();
}

/** Zieht den Bereitschafts-Hinweis zurück (Agent entscheidet: Thema wird
 * erkennbar weiterverfolgt statt abgeschlossen). */
export function clearPhaseReady(phaseId: string) {
  db.update(phases).set({ readySummary: null, readyAt: null }).where(eq(phases.id, phaseId)).run();
  return db.select().from(phases).where(eq(phases.id, phaseId)).get();
}
