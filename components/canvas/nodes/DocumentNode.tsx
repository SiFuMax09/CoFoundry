"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { VersionHistory } from "../VersionHistory";
import { stripMarkdown } from "@/lib/canvas/text";

export interface DocumentNodeData {
  title: string;
  content: string;
  status: "draft" | "final" | null;
  dimmed: boolean;
  onExpand: () => void;
}

export function DocumentNode({ id, data }: NodeProps & { data: DocumentNodeData }) {
  return (
    <div
      className={`card relative flex h-full w-full flex-col overflow-hidden transition-opacity ${
        data.dimmed ? "phase-dimmed" : ""
      }`}
      onDoubleClick={data.onExpand}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <p className="truncate text-sm font-semibold text-ink">{data.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          {data.status === "draft" && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-strong">
              Entwurf
            </span>
          )}
          <VersionHistory itemId={id} />
        </div>
      </div>
      <p className="thin-scroll flex-1 overflow-hidden px-3 py-2 text-xs leading-relaxed text-muted">
        {stripMarkdown(data.content).slice(0, 220) || "Leeres Dokument"}
      </p>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
