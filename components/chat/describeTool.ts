const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  create_note: (a) => `Notiz angelegt: „${a.title ?? "?"}“`,
  create_document: (a) => `Dokument angelegt: „${a.title ?? "?"}“`,
  update_canvas_item: () => `Canvas-Element aktualisiert`,
  read_canvas_item: () => `Canvas-Element gelesen`,
  get_canvas_overview: () => `Canvas-Übersicht abgerufen`,
  link_items: () => `Elemente verknüpft`,
  update_phase: () => `Phase aktualisiert`,
  set_phase_ready: () => `Bereitschaft signalisiert`,
  clear_phase_ready: () => `Bereitschafts-Hinweis zurückgezogen`,
};

export function describeToolCall(name: string, argumentsJson: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argumentsJson || "{}");
  } catch {
    // Ungültiges JSON -> generisches Label unten.
  }
  const fn = TOOL_LABELS[name];
  return fn ? fn(args) : name;
}
