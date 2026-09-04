import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { listPhasesForProject } from "@/lib/phases";
import { listCanvasItemsForProject } from "@/lib/canvas-items";
import { db } from "@/lib/db";
import { canvasItems, canvasLinks } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const project = getOwnedProject(id, user.id);
  if (!project) notFound();

  const phases = listPhasesForProject(id);
  const items = listCanvasItemsForProject(id);

  const itemIds = db
    .select({ id: canvasItems.id })
    .from(canvasItems)
    .where(eq(canvasItems.projectId, id))
    .all()
    .map((r) => r.id);
  const links = itemIds.length
    ? db.select().from(canvasLinks).where(inArray(canvasLinks.fromItemId, itemIds)).all()
    : [];

  return (
    <div className="flex h-full min-h-0 flex-1">
      <ProjectWorkspace
        projectId={id}
        projectName={project.name}
        // JSON-Serialisierung übernimmt next.js beim Durchreichen an die
        // Client Component ohnehin (Date -> ISO-String), hier nur für
        // konsistente Typen mit den API-Routen explizit gemacht.
        phases={JSON.parse(JSON.stringify(phases))}
        items={JSON.parse(JSON.stringify(items))}
        links={JSON.parse(JSON.stringify(links))}
      />
    </div>
  );
}
