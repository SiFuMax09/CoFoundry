import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, phases, chatMessages } from "@/lib/db/schema";

/**
 * Projekt-Briefing für den Ultraplan-Dispatch: Wizard-Antworten (grober
 * Rahmen) + kompletter Phase-0-Chatverlauf (die eigentliche Substanz).
 */
export function buildProjectBriefing(projectId: string): string {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  const phase0 = db
    .select()
    .from(phases)
    .where(eq(phases.projectId, projectId))
    .orderBy(asc(phases.order))
    .get();

  const onboarding = project?.onboardingJson ? JSON.parse(project.onboardingJson) : null;
  const onboardingText = onboarding
    ? Object.entries(onboarding)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n")
    : "(keine Wizard-Antworten hinterlegt)";

  const transcript = phase0
    ? db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.phaseId, phase0.id))
        .orderBy(asc(chatMessages.createdAt))
        .all()
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "summary")
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
    : "(kein Phase-0-Chat vorhanden)";

  return `# Projekt: ${project?.name ?? "Unbenannt"}

## Onboarding-Wizard (grober Rahmen)
${onboardingText}

## Phase-0-Chat "Grundlagen klären" (eigentliche Substanz)
${transcript}`;
}
