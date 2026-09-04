import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { canvasItemVersions, canvasItems } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";

const MAX_VERSIONS_PER_ITEM = 20;

export interface CanvasItemPatch {
  title?: string;
  content?: string;
  color?: string | null;
  status?: "draft" | "final" | null;
  phaseId?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Wendet ein Update auf ein Canvas-Item an. Ändert es Titel oder Inhalt,
 * wird der BISHERIGE Stand zuerst als Version gesichert (Sicherheitsnetz
 * gegen ungewolltes Überschreiben) — reine Positions-/Größenänderungen
 * (Drag & Drop) erzeugen bewusst keine Version, sonst würde die Historie
 * mit jedem Verschieben zumüllen.
 *
 * Hält maximal die letzten MAX_VERSIONS_PER_ITEM Versionen pro Item, ältere
 * werden automatisch entfernt.
 */
export function applyCanvasItemUpdate(
  itemId: string,
  patch: CanvasItemPatch,
  editedBy: "user" | "agent"
) {
  const current = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
  if (!current) return null;

  const touchesContent =
    (patch.title !== undefined && patch.title !== current.title) ||
    (patch.content !== undefined && patch.content !== current.content);

  db.transaction((tx) => {
    if (touchesContent) {
      tx.insert(canvasItemVersions)
        .values({
          id: newId("version"),
          itemId,
          title: current.title,
          content: current.content,
          editedBy,
        })
        .run();

      // Älteste Versionen über dem Limit hinaus entfernen.
      const versions = tx
        .select({ id: canvasItemVersions.id, createdAt: canvasItemVersions.createdAt })
        .from(canvasItemVersions)
        .where(eq(canvasItemVersions.itemId, itemId))
        .orderBy(desc(canvasItemVersions.createdAt))
        .all();
      const overflow = versions.slice(MAX_VERSIONS_PER_ITEM);
      for (const old of overflow) {
        tx.delete(canvasItemVersions).where(eq(canvasItemVersions.id, old.id)).run();
      }
    }

    tx.update(canvasItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(canvasItems.id, itemId))
      .run();
  });

  return db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
}
