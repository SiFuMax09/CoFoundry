import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItems, canvasLinks, canvasItemStatusValues } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { publishCanvasEvent } from "@/lib/events";
import { applyCanvasItemUpdate } from "@/lib/canvas/versions";
import { placeDefault, placeRadially, type Rect } from "@/lib/canvas/layout";
import { summarize } from "@/lib/canvas/text";
import { listCanvasItemsForProject } from "@/lib/canvas-items";
import { updatePhaseFields, setPhaseReady, clearPhaseReady, type PhaseFieldPatch } from "@/lib/phases";

/**
 * Agent-Tools für die Canvas (Function Calling). `project_id` ist bewusst
 * NICHT Teil der dem Modell gezeigten JSON-Schemas — die Ausführung ist
 * ohnehin immer auf das Projekt des laufenden Chats beschränkt (aus dem
 * ToolContext, nicht vom Modell frei wählbar). Das verhindert, dass ein
 * Modell versehentlich eine falsche/erfundene Projekt-ID einsetzt.
 */

export interface ToolContext {
  projectId: string;
  userId: string;
  currentPhaseId: string;
  /** Items, die in diesem Tool-Loop-Durchlauf neu entstanden sind — steuert,
   * ob link_items eine radiale Neu-Platzierung auslöst (nur für frische
   * Items, nicht für länger bestehende). */
  createdItemIds: Set<string>;
}

export interface ToolExecutionResult {
  /** Wird dem Modell als Tool-Ergebnis zurückgegeben (kompakt halten). */
  result: Record<string, unknown>;
  /** Kurzer, menschenlesbarer Hinweis fürs Chat-Transkript ("Notiz „X“ angelegt"). */
  summary: string;
  /** Für die SSE-canvas_update-Mitteilung im /api/ai-Stream. */
  canvasUpdate?: { kind: "item" | "phase"; data: unknown };
}

// --- Schemas -----------------------------------------------------------

const createNoteSchema = z.object({
  phase_id: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  content: z.string().max(20_000).default(""),
  color: z.string().max(32).optional(),
});

const createDocumentSchema = z.object({
  phase_id: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  content_markdown: z.string().max(200_000).default(""),
});

const updateCanvasItemSchema = z.object({
  item_id: z.string(),
  title: z.string().max(200).optional(),
  content: z.string().max(200_000).optional(),
  status: z.enum(canvasItemStatusValues).nullable().optional(),
});

const readCanvasItemSchema = z.object({ item_id: z.string() });

const getCanvasOverviewSchema = z.object({ phase_id: z.string().nullable().optional() });

const linkItemsSchema = z.object({
  from_item_id: z.string(),
  to_item_id: z.string(),
  relation_label: z.string().max(120).default(""),
});

const updatePhaseSchema = z.object({
  phase_id: z.string(),
  title: z.string().max(200).optional(),
  goal: z.string().max(2000).optional(),
  brief: z.string().max(4000).optional(),
  status: z.enum(["todo", "active", "done"]).optional(),
  order: z.number().int().optional(),
});

const setPhaseReadySchema = z.object({
  phase_id: z.string(),
  summary: z.string().min(1).max(2000),
});

const clearPhaseReadySchema = z.object({ phase_id: z.string() });

// --- JSON-Schemas fürs Function-Calling (handschriftlich, klein genug ohne zod-to-json-schema) ---

const toolDefs = [
  {
    type: "function" as const,
    function: {
      name: "create_note",
      description:
        "Legt eine kurze, farbige Notiz-Karte auf der Canvas an — für kurze, eigenständige Infos (Erkenntnis, Risiko, Idee).",
      parameters: {
        type: "object",
        properties: {
          phase_id: {
            type: "string",
            description: "Zielphase. Weglassen für die aktuell offene Phase, sonst gezielt eine andere Phase referenzieren.",
          },
          title: { type: "string", description: "Kurzer Titel." },
          content: { type: "string", description: "Kurzer Notiztext." },
          color: { type: "string", description: "Hex-Farbe, z. B. #EDE9FB. Optional." },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_document",
      description:
        "Legt ein strukturiertes Markdown-Dokument auf der Canvas an — für Roadmaps, Recherche-Ergebnisse, Briefings, längere Inhalte.",
      parameters: {
        type: "object",
        properties: {
          phase_id: { type: "string", description: "Zielphase. Weglassen für die aktuell offene Phase." },
          title: { type: "string" },
          content_markdown: { type: "string", description: "Vollständiger Markdown-Inhalt." },
        },
        required: ["title", "content_markdown"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_canvas_item",
      description: "Überschreibt Titel/Inhalt/Status eines bestehenden Canvas-Items. Der bisherige Stand wird automatisch als Version gesichert.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          status: { type: "string", enum: ["draft", "final"], description: "Optional, nur für Dokumente relevant." },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_canvas_item",
      description: "Liest den vollständigen Titel und Inhalt eines Canvas-Items.",
      parameters: {
        type: "object",
        properties: { item_id: { type: "string" } },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_canvas_overview",
      description:
        "Kompakte Liste aller Canvas-Items des Projekts (Titel, Typ, Kurzsummary, Phase) — ohne Volltext. Optional auf eine Phase gefiltert.",
      parameters: {
        type: "object",
        properties: {
          phase_id: { type: "string", description: "Nur Items dieser Phase. Weglassen für alle Phasen." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "link_items",
      description:
        "Verbindet zwei Canvas-Items mit einer gerichteten, beschrifteten Kante (z. B. „Research → informiert → Solution“).",
      parameters: {
        type: "object",
        properties: {
          from_item_id: { type: "string" },
          to_item_id: { type: "string" },
          relation_label: { type: "string" },
        },
        required: ["from_item_id", "to_item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_phase",
      description:
        "Ändert Titel/Ziel/Brief einer Phase. NICHT für den Phasenübergang nutzen — dafür ist set_phase_ready da, der Nutzer entscheidet per Klick.",
      parameters: {
        type: "object",
        properties: {
          phase_id: { type: "string" },
          title: { type: "string" },
          goal: { type: "string" },
          brief: { type: "string" },
        },
        required: ["phase_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_phase_ready",
      description:
        "Signalisiert, dass das Ziel der aktuellen Phase erreicht scheint (oder der Nutzer das selbst sagt). Zeigt dem Nutzer einen Hinweis mit Zusammenfassung — der Nutzer entscheidet per Klick über den Übergang zur nächsten Phase.",
      parameters: {
        type: "object",
        properties: {
          phase_id: { type: "string" },
          summary: { type: "string", description: "Kurze Zusammenfassung dessen, was in dieser Phase erreicht wurde." },
        },
        required: ["phase_id", "summary"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_phase_ready",
      description:
        "Zieht einen zuvor per set_phase_ready gezeigten Bereitschafts-Hinweis zurück — nutzen, wenn der Nutzer das Thema der aktuellen Phase erkennbar weiterverfolgt, statt abzuschließen.",
      parameters: {
        type: "object",
        properties: { phase_id: { type: "string" } },
        required: ["phase_id"],
      },
    },
  },
];

export function buildToolDefinitions() {
  return toolDefs;
}

// --- Ausführung ----------------------------------------------------------

function itemsToRects(items: Array<{ x: number; y: number; width: number; height: number }>): Rect[] {
  return items.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

function createCanvasItem(
  ctx: ToolContext,
  type: "note" | "document",
  phaseId: string | null,
  title: string,
  content: string,
  color?: string
): ToolExecutionResult {
  const existing = listCanvasItemsForProject(ctx.projectId);
  const size = type === "note" ? { width: 220, height: 180 } : { width: 280, height: 200 };
  const { x, y } = placeDefault(itemsToRects(existing));

  const id = newId("item");
  db.insert(canvasItems)
    .values({
      id,
      projectId: ctx.projectId,
      phaseId: phaseId ?? ctx.currentPhaseId,
      type,
      title,
      content,
      color: color ?? null,
      x,
      y,
      width: size.width,
      height: size.height,
    })
    .run();

  ctx.createdItemIds.add(id);
  const item = db.select().from(canvasItems).where(eq(canvasItems.id, id)).get();
  publishCanvasEvent(ctx.projectId, { type: "item_created", item });

  return {
    result: { item_id: id, title, type },
    summary: `${type === "note" ? "Notiz" : "Dokument"} „${title}“ angelegt`,
    canvasUpdate: { kind: "item", data: item },
  };
}

function verifyItemInProject(itemId: string, projectId: string) {
  const item = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
  if (!item || item.projectId !== projectId) return null;
  return item;
}

export async function executeToolCall(
  name: string,
  rawArgs: string,
  ctx: ToolContext
): Promise<ToolExecutionResult> {
  const parsedArgs = (() => {
    try {
      return JSON.parse(rawArgs || "{}");
    } catch {
      return {};
    }
  })();

  switch (name) {
    case "create_note": {
      const args = createNoteSchema.parse(parsedArgs);
      return createCanvasItem(ctx, "note", args.phase_id ?? null, args.title, args.content, args.color);
    }

    case "create_document": {
      const args = createDocumentSchema.parse(parsedArgs);
      return createCanvasItem(ctx, "document", args.phase_id ?? null, args.title, args.content_markdown);
    }

    case "update_canvas_item": {
      const args = updateCanvasItemSchema.parse(parsedArgs);
      const existing = verifyItemInProject(args.item_id, ctx.projectId);
      if (!existing) {
        return { result: { error: "Item nicht gefunden." }, summary: "Update fehlgeschlagen: Item nicht gefunden." };
      }
      const updated = applyCanvasItemUpdate(
        args.item_id,
        { title: args.title, content: args.content, status: args.status },
        "agent"
      );
      publishCanvasEvent(ctx.projectId, { type: "item_updated", item: updated });
      return {
        result: { item_id: args.item_id },
        summary: `„${updated?.title ?? existing.title}“ aktualisiert`,
        canvasUpdate: { kind: "item", data: updated },
      };
    }

    case "read_canvas_item": {
      const args = readCanvasItemSchema.parse(parsedArgs);
      const item = verifyItemInProject(args.item_id, ctx.projectId);
      if (!item) {
        return { result: { error: "Item nicht gefunden." }, summary: "Lesen fehlgeschlagen: Item nicht gefunden." };
      }
      return {
        result: { title: item.title, content: item.content, type: item.type, phase_id: item.phaseId },
        summary: `„${item.title}“ gelesen`,
      };
    }

    case "get_canvas_overview": {
      const args = getCanvasOverviewSchema.parse(parsedArgs);
      const items = listCanvasItemsForProject(ctx.projectId).filter(
        (i) => !args.phase_id || i.phaseId === args.phase_id
      );
      return {
        result: {
          items: items.map((i) => ({
            id: i.id,
            type: i.type,
            title: i.title,
            phase_id: i.phaseId,
            summary: summarize(i.content, 140),
          })),
        },
        summary: `Canvas-Übersicht (${items.length} Elemente) gelesen`,
      };
    }

    case "link_items": {
      const args = linkItemsSchema.parse(parsedArgs);
      const from = verifyItemInProject(args.from_item_id, ctx.projectId);
      const to = verifyItemInProject(args.to_item_id, ctx.projectId);
      if (!from || !to) {
        return { result: { error: "Item(s) nicht gefunden." }, summary: "Verknüpfung fehlgeschlagen." };
      }

      // Neu erzeugte Items radial um ihr Ursprungs-Item herum platzieren.
      if (ctx.createdItemIds.has(to.id)) {
        const existing = listCanvasItemsForProject(ctx.projectId).filter((i) => i.id !== to.id);
        const { x, y } = placeRadially(from, { width: to.width, height: to.height }, itemsToRects(existing));
        db.update(canvasItems).set({ x, y, updatedAt: new Date() }).where(eq(canvasItems.id, to.id)).run();
        const updated = db.select().from(canvasItems).where(eq(canvasItems.id, to.id)).get();
        publishCanvasEvent(ctx.projectId, { type: "item_updated", item: updated });
      }

      const linkId = newId("link");
      db.insert(canvasLinks)
        .values({ id: linkId, fromItemId: from.id, toItemId: to.id, relationLabel: args.relation_label })
        .run();
      const link = db.select().from(canvasLinks).where(eq(canvasLinks.id, linkId)).get();
      publishCanvasEvent(ctx.projectId, { type: "link_created", link });

      return {
        result: { link_id: linkId },
        summary: `„${from.title}“ mit „${to.title}“ verknüpft`,
      };
    }

    case "update_phase": {
      const args = updatePhaseSchema.parse(parsedArgs);
      const patch: PhaseFieldPatch = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.goal !== undefined) patch.goal = args.goal;
      if (args.brief !== undefined) patch.brief = args.brief;
      if (args.status !== undefined) patch.status = args.status;
      if (args.order !== undefined) patch.order = args.order;
      const updated = updatePhaseFields(args.phase_id, patch);
      if (updated) publishCanvasEvent(ctx.projectId, { type: "phase_updated", phase: updated });
      return {
        result: { phase_id: args.phase_id },
        summary: `Phase „${updated?.title ?? args.phase_id}“ aktualisiert`,
        canvasUpdate: updated ? { kind: "phase", data: updated } : undefined,
      };
    }

    case "set_phase_ready": {
      const args = setPhaseReadySchema.parse(parsedArgs);
      const updated = setPhaseReady(args.phase_id, args.summary);
      if (updated) publishCanvasEvent(ctx.projectId, { type: "phase_updated", phase: updated });
      return {
        result: { phase_id: args.phase_id },
        summary: "Bereitschaft für den Phasenübergang signalisiert",
        canvasUpdate: updated ? { kind: "phase", data: updated } : undefined,
      };
    }

    case "clear_phase_ready": {
      const args = clearPhaseReadySchema.parse(parsedArgs);
      const updated = clearPhaseReady(args.phase_id);
      if (updated) publishCanvasEvent(ctx.projectId, { type: "phase_updated", phase: updated });
      return {
        result: { phase_id: args.phase_id },
        summary: "Bereitschafts-Hinweis zurückgezogen",
        canvasUpdate: updated ? { kind: "phase", data: updated } : undefined,
      };
    }

    default:
      return { result: { error: `Unbekanntes Tool: ${name}` }, summary: `Unbekanntes Tool: ${name}` };
  }
}
