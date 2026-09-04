/**
 * Feste Modell-Zuordnung pro Aufgabenrolle — kein Lern-/Decider-System,
 * bewusst hier zentral als einfache Konstante gepflegt (siehe Auftrag).
 * Modell-Slugs gelegentlich gegen https://openrouter.ai/models prüfen, sie
 * ändern sich mit neuen Modellgenerationen.
 *
 * maxTokens ist ein striktes Limit je Aufgabenrolle (Token-Effizienz),
 * temperature ist bewusst niedrig für strukturierte/Tool-lastige Rollen und
 * etwas höher für kreative Textarbeit.
 */

export const TASK_TYPES = [
  "ultraplan_orchestrator",
  "ultraplan_subagent",
  "research_subagent",
  "research_synthesis",
  "active_chat",
  "chat_summarization",
  "website_copy",
  "youtube_script",
  "marketing_content",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export interface TaskConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  /** Kurze Begründung für die Modellwahl — erscheint auch read-only in /settings. */
  reason: string;
}

export const TASK_CONFIG: Record<TaskType, TaskConfig> = {
  ultraplan_orchestrator: {
    model: "anthropic/claude-opus-5",
    maxTokens: 4000,
    temperature: 0.4,
    reason: "Komplexeste Einzelaufgabe im System — bestimmt die gesamte Projektstruktur.",
  },
  ultraplan_subagent: {
    model: "openai/gpt-5-mini",
    maxTokens: 2000,
    temperature: 0.3,
    reason: "Enge, parallele Einzelaufgabe mit striktem Zod-Schema-Output.",
  },
  research_subagent: {
    model: "openai/gpt-5-mini",
    maxTokens: 2000,
    temperature: 0.3,
    reason: "Enge, parallele Einzelaufgabe mit striktem Zod-Schema-Output.",
  },
  research_synthesis: {
    model: "anthropic/claude-opus-5",
    maxTokens: 4000,
    temperature: 0.4,
    reason: "Muss mehrere Quellen widerspruchsfrei zu einem Dokument verdichten.",
  },
  active_chat: {
    model: "openai/gpt-5-mini",
    maxTokens: 2000,
    temperature: 0.6,
    reason: "Für die meisten Chat-Turns ausreichend, hält laufende Kosten niedrig.",
  },
  chat_summarization: {
    model: "openai/gpt-5-mini",
    maxTokens: 800,
    temperature: 0.2,
    reason: "Rein extraktive Aufgabe, keine Kreativität nötig.",
  },
  website_copy: {
    model: "anthropic/claude-sonnet-5",
    maxTokens: 3000,
    temperature: 0.7,
    reason: "Kreative Textarbeit profitiert von einem stärkeren Modell.",
  },
  youtube_script: {
    model: "anthropic/claude-sonnet-5",
    maxTokens: 2000,
    temperature: 0.7,
    reason: "Kreative Textarbeit.",
  },
  marketing_content: {
    model: "anthropic/claude-sonnet-5",
    maxTokens: 2000,
    temperature: 0.7,
    reason: "Kreative Textarbeit.",
  },
};

/** Modelle, die für die manuelle Umschaltung im Phasen-Chat wählbar sind. */
export const ACTIVE_CHAT_MODEL_OPTIONS = [
  { model: "openai/gpt-5-mini", label: "Standard" },
  { model: "anthropic/claude-sonnet-5", label: "Hochschalten" },
] as const;

export function getTaskConfig(taskType: TaskType, modelOverride?: string | null): TaskConfig {
  const base = TASK_CONFIG[taskType];
  return modelOverride ? { ...base, model: modelOverride } : base;
}

export function isAnthropicModel(model: string): boolean {
  return model.startsWith("anthropic/");
}
