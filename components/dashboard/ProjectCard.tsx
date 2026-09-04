import Link from "next/link";
import type { ProjectSummary } from "@/lib/projects";
import { formatRelativeTime } from "@/lib/format";
import { CanvasPreview } from "./CanvasPreview";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const phaseNumber = project.currentPhase ? project.currentPhase.order + 1 : 0;
  const progress = project.phaseCount > 0 ? phaseNumber / project.phaseCount : 0;

  return (
    <Link
      href={`/project/${project.id}`}
      className="card group block overflow-hidden transition hover:shadow-panel"
    >
      <CanvasPreview items={project.previewItems} />
      <div className="p-4">
        <h3 className="truncate font-display text-base font-semibold text-ink">
          {project.name}
        </h3>
        <p className="mt-0.5 truncate text-sm text-muted">
          {project.currentPhase ? project.currentPhase.title : "Noch keine Phase"}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-progress transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-muted">
            Phase {String(phaseNumber).padStart(2, "0")}/{String(project.phaseCount).padStart(2, "0")}
          </span>
        </div>

        <p className="mt-2 text-xs text-muted">{formatRelativeTime(project.lastActivityAt)}</p>
      </div>
    </Link>
  );
}
