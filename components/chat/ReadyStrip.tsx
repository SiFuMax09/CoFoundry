"use client";

import { useState } from "react";

export function ReadyStrip({
  nextPhaseTitle,
  isLastPhase,
  onAdvance,
  onExtendRoadmap,
}: {
  nextPhaseTitle: string | null;
  isLastPhase: boolean;
  onAdvance: () => Promise<void>;
  onExtendRoadmap: (title: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function handleAdvance() {
    setBusy(true);
    try {
      await onAdvance();
    } finally {
      setBusy(false);
    }
  }

  async function handleExtend() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      await onExtendRoadmap(newTitle.trim());
      setNaming(false);
      setNewTitle("");
    } finally {
      setBusy(false);
    }
  }

  if (isLastPhase) {
    return (
      <div className="mb-2 rounded-xl border border-hairline bg-accent-soft px-3 py-2.5">
        {naming ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Name der neuen Phase"
              onKeyDown={(e) => e.key === "Enter" && handleExtend()}
              className="flex-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs outline-none"
            />
            <button
              type="button"
              onClick={handleExtend}
              disabled={busy || !newTitle.trim()}
              className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              Anlegen
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-accent-strong">Projekt abgeschlossen — Roadmap erweitern?</p>
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong"
            >
              Roadmap erweitern
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-accent-soft px-3 py-2.5">
      <p className="text-xs font-medium text-accent-strong">Bereit für Phase „{nextPhaseTitle}“?</p>
      <button
        type="button"
        onClick={handleAdvance}
        disabled={busy}
        className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "…" : `Weiter zu „${nextPhaseTitle}“`}
      </button>
    </div>
  );
}
