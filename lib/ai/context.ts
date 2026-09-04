import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { listPhasesForProject } from "@/lib/phases";
import { listCanvasItemsForProject } from "@/lib/canvas-items";
import { summarize } from "@/lib/canvas/text";
import { getPhaseMessages, getRecentPhaseMessages, saveChatMessage, deleteMessages } from "./chat-log";
import { chatCompletion, type ORMessage } from "./openrouter";

const RECENT_TURNS = 6;
const SUMMARIZE_THRESHOLD_CHARS = 24_000; // ~6k Tokens bei ~4 Zeichen/Token

/**
 * Fasst ältere, nicht mehr im "letzte 4-6 Turns"-Fenster enthaltene
 * Nachrichten einer Phase zusammen, sobald sie den Token-Schwellwert
 * überschreiten. Ersetzt sie durch eine einzelne role="summary"-Nachricht —
 * hält den Kontext klein, ohne Verlauf komplett zu verlieren.
 */
export async function ensureSummarized(params: {
  projectId: string;
  phaseId: string;
  userId: string;
  apiKey: string;
}) {
  const all = getPhaseMessages(params.phaseId);
  if (all.length <= RECENT_TURNS) return;

  const older = all.slice(0, all.length - RECENT_TURNS);
  const olderChars = older.reduce((sum, m) => sum + m.content.length, 0);
  if (olderChars < SUMMARIZE_THRESHOLD_CHARS) return;

  const transcript = older
    .map((m) => `${m.role}: ${m.content || (m.toolCalls ? `[Tool-Aufruf] ${m.toolCalls}` : "")}`)
    .join("\n");

  const result = await chatCompletion({
    apiKey: params.apiKey,
    userId: params.userId,
    taskType: "chat_summarization",
    messages: [
      {
        role: "user",
        content:
          "Fasse den folgenden Ausschnitt eines Chatverlaufs zwischen einem Gründer und seinem KI-Co-Founder " +
          "kompakt zusammen (max. 200 Wörter). Behalte konkrete Entscheidungen, Zahlen und offene Fragen bei:\n\n" +
          transcript,
      },
    ],
  });

  saveChatMessage({
    projectId: params.projectId,
    phaseId: params.phaseId,
    role: "summary",
    content: result.content ?? "(Zusammenfassung fehlgeschlagen)",
    model: result.model,
  });

  deleteMessages(older.map((m) => m.id));
}

function buildSystemPrompt(params: {
  projectName: string;
  phases: Array<{ id: string; title: string; goal: string; status: string; order: number }>;
  currentPhaseId: string;
  canvasItems: Array<{ id: string; type: string; title: string; phaseId: string | null; content: string }>;
}): string {
  const phaseLines = params.phases
    .map((p) => {
      const marker = p.id === params.currentPhaseId ? "→ AKTUELL" : p.status === "done" ? "✓ erledigt" : "";
      return `- [${p.id}] Phase ${p.order + 1} „${p.title}“ ${marker}${p.goal ? ` — Ziel: ${p.goal}` : ""}`;
    })
    .join("\n");

  const overviewLines = params.canvasItems
    .map((i) => `- [${i.id}] (${i.type}${i.phaseId ? `, Phase ${i.phaseId}` : ""}) „${i.title}“ — ${summarize(i.content, 100)}`)
    .join("\n");

  return `Du bist der AI-Co-Founder im Cofoundry-Projekt „${params.projectName}“. Du hilfst dem Gründer im Chat der aktuell offenen Phase weiter.

Verfügbare Phasen dieses Projekts:
${phaseLines || "(noch keine Phasen)"}

Aktuelle Canvas-Übersicht (Kurzsummaries, Volltext bei Bedarf über read_canvas_item nachladen):
${overviewLines || "(Canvas ist noch leer)"}

Regeln:
- Schreibe Entscheidungen, Ergebnisse und Recherchen aktiv auf die Canvas (create_note/create_document), nicht nur in den Chat — Chats sind flüchtig, die Canvas ist dauerhaft.
- Erkennst du, dass etwas thematisch zu einer ANDEREN Phase gehört (nicht der aktuell offenen), nutze deren phase_id aus der Liste oben statt der aktuellen Phase.
- Wenn du den Eindruck hast, das Ziel der aktuellen Phase ist erreicht (oder der Nutzer das selbst sagt), rufe set_phase_ready mit einer kurzen Zusammenfassung auf. Ändere den Phasen-Status NIEMALS selbst über update_phase — der Nutzer entscheidet per Klick über den Übergang.
- Verfolgt der Nutzer nach einem set_phase_ready-Hinweis das Thema der aktuellen Phase erkennbar weiter (statt abzuschließen), rufe clear_phase_ready auf, um den Hinweis zurückzuziehen.
- Halte Antworten knapp und konkret. Nutze get_canvas_overview erneut, falls sich die Canvas seit Gesprächsbeginn merklich verändert haben könnte.`;
}

export async function buildChatContext(params: {
  projectId: string;
  phaseId: string;
  userMessage: string;
}): Promise<{ stableMessages: ORMessage[]; variableMessages: ORMessage[] }> {
  const project = db.select({ name: projects.name }).from(projects).where(eq(projects.id, params.projectId)).get();
  const phases = listPhasesForProject(params.projectId);
  const canvasItems = listCanvasItemsForProject(params.projectId);

  const systemPrompt = buildSystemPrompt({
    projectName: project?.name ?? "Unbenanntes Projekt",
    phases,
    currentPhaseId: params.phaseId,
    canvasItems,
  });

  const recent = getRecentPhaseMessages(params.phaseId, RECENT_TURNS);
  const recentMessages: ORMessage[] = recent.flatMap((m): ORMessage[] => {
    if (m.role === "user") return [{ role: "user", content: m.content }];
    if (m.role === "summary") return [{ role: "system", content: `Bisheriger Verlauf (zusammengefasst): ${m.content}` }];
    if (m.role === "tool") {
      return [{ role: "tool", content: m.content, tool_call_id: m.toolCallId ?? undefined }];
    }
    if (m.role === "assistant") {
      const toolCalls = m.toolCalls ? JSON.parse(m.toolCalls) : undefined;
      return [{ role: "assistant", content: m.content, tool_calls: toolCalls }];
    }
    return [];
  });

  return {
    stableMessages: [{ role: "system", content: systemPrompt }],
    variableMessages: [...recentMessages, { role: "user", content: params.userMessage }],
  };
}
