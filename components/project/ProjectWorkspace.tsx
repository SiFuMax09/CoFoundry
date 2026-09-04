"use client";

import { useRef } from "react";
import { ProjectHeader } from "./ProjectHeader";
import { CanvasView } from "@/components/canvas/CanvasView";
import type { ApiCanvasItem, ApiCanvasLink, ApiPhase } from "@/components/canvas/types";

export function ProjectWorkspace({
  projectId,
  projectName,
  phases,
  items,
  links,
}: {
  projectId: string;
  projectName: string;
  phases: ApiPhase[];
  items: ApiCanvasItem[];
  links: ApiCanvasLink[];
}) {
  const activePhase = phases.find((p) => p.status === "active") ?? null;
  const focusHandlerRef = useRef<((phaseId: string) => void) | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ProjectHeader
        projectId={projectId}
        projectName={projectName}
        phases={phases}
        activePhase={activePhase}
        onJumpToPhase={(phaseId) => focusHandlerRef.current?.(phaseId)}
      />
      <div className="relative min-h-0 flex-1">
        <CanvasView
          projectId={projectId}
          initialItems={items}
          initialLinks={links}
          activePhaseId={activePhase?.id ?? null}
          registerFocusHandler={(fn) => {
            focusHandlerRef.current = fn;
          }}
        />
      </div>
    </div>
  );
}
