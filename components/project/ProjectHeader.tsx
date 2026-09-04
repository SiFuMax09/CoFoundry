"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon, ChevronDownIcon, ShareIcon, ExportIcon } from "@/components/icons/project";
import type { ApiPhase } from "@/components/canvas/types";

export function ProjectHeader({
  projectId,
  projectName,
  phases,
  activePhase,
  onJumpToPhase,
}: {
  projectId: string;
  projectName: string;
  phases: ApiPhase[];
  activePhase: ApiPhase | null;
  onJumpToPhase: (phaseId: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(activePhase?.title ?? "");

  async function commitTitle() {
    setEditingTitle(false);
    if (activePhase && title.trim() && title !== activePhase.title) {
      await fetch(`/api/phases/${activePhase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Zwischenablage ohne Berechtigung — kein Absturz, einfach kein Effekt.
    }
  }

  async function exportCanvas() {
    const res = await fetch(`/api/projects/${projectId}/canvas-items`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-canvas.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-cream-light px-5">
      <Link href="/dashboard" aria-label="Zurück zur Übersicht" className="rounded-lg p-2 text-ink hover:bg-cream">
        <MenuIcon className="h-5 w-5" />
      </Link>

      {editingTitle ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && commitTitle()}
          className="font-display text-lg font-semibold text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setTitle(activePhase?.title ?? "");
            setEditingTitle(true);
          }}
          className="font-display text-lg font-semibold text-ink hover:text-accent-strong"
        >
          {activePhase?.title ?? "Keine aktive Phase"}
        </button>
      )}

      <div className="relative ml-2">
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:border-accent"
        >
          {activePhase
            ? `Phase ${String(activePhase.order + 1).padStart(2, "0")}/${String(phases.length).padStart(2, "0")}`
            : "Keine Phasen"}
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-panel">
            {phases.map((phase) => (
              <button
                key={phase.id}
                type="button"
                onClick={() => {
                  onJumpToPhase(phase.id);
                  setDropdownOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-cream ${
                  phase.status === "active" ? "text-ink font-medium" : "text-muted"
                }`}
              >
                <span className="truncate">
                  {String(phase.order + 1).padStart(2, "0")} · {phase.title}
                </span>
                {phase.status === "done" && <span className="text-xs text-progress">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 truncate text-center text-sm text-muted">{projectName}</div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={copyShareLink}
          aria-label="Link kopieren"
          title="Link kopieren"
          className="rounded-lg p-2 text-muted hover:bg-cream hover:text-ink"
        >
          <ShareIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={exportCanvas}
          aria-label="Canvas exportieren"
          title="Canvas als JSON exportieren"
          className="rounded-lg p-2 text-muted hover:bg-cream hover:text-ink"
        >
          <ExportIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
