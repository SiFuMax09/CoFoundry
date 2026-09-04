"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface NoteNodeData {
  title: string;
  content: string;
  color: string | null;
  phaseId: string | null;
  dimmed: boolean;
  onSave: (patch: { title?: string; content?: string }) => void;
}

const NOTE_COLORS = ["#EDE9FB", "#FFF3C4", "#FFE0DE", "#D9F2E3", "#DCEBFF"];

export function NoteNode({ data }: NodeProps & { data: NoteNodeData }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.title);
  const [content, setContent] = useState(data.content);

  function commit() {
    setEditing(false);
    if (title !== data.title || content !== data.content) {
      data.onSave({ title, content });
    }
  }

  return (
    <div
      className={`w-full h-full rounded-lg p-3 shadow-sticky transition-opacity ${
        data.dimmed ? "phase-dimmed" : ""
      }`}
      style={{ background: data.color ?? NOTE_COLORS[0] }}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {editing ? (
        <div className="flex h-full flex-col gap-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-ink outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={commit}
            className="thin-scroll flex-1 resize-none bg-transparent text-sm text-ink/80 outline-none"
          />
        </div>
      ) : (
        <div className="flex h-full flex-col gap-1 overflow-hidden">
          <p className="text-sm font-semibold text-ink">{data.title}</p>
          <p className="thin-scroll flex-1 overflow-hidden whitespace-pre-wrap text-sm text-ink/80">
            {data.content}
          </p>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export { NOTE_COLORS };
