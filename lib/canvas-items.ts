import { eq } from "drizzle-orm";
import { db } from "./db";
import { canvasItems, projects } from "./db/schema";

/** Lädt ein Canvas-Item nur, wenn sein Projekt dem angegebenen Nutzer gehört. */
export function getOwnedCanvasItem(itemId: string, userId: string) {
  const item = db.select().from(canvasItems).where(eq(canvasItems.id, itemId)).get();
  if (!item) return null;
  const project = db.select().from(projects).where(eq(projects.id, item.projectId)).get();
  if (!project || project.userId !== userId) return null;
  return { item, project };
}

export function listCanvasItemsForProject(projectId: string) {
  return db.select().from(canvasItems).where(eq(canvasItems.projectId, projectId)).all();
}
