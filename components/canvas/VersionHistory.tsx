"use client";

import { useState } from "react";
import { ClockIcon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/format";

interface VersionRow {
  id: string;
  title: string;
  content: string;
  editedBy: "user" | "agent";
  createdAt: string;
}

export function VersionHistory({
  itemId,
  onRestored,
}: {
  itemId: string;
  onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [selected, setSelected] = useState<VersionRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    setSelected(null);
    if (next) {
      setLoading(true);
      try {
        const res = await fetch(`/api/canvas-items/${itemId}/versions`);
        const data = await res.json();
        setVersions(data.versions ?? []);
      } finally {
        setLoading(false);
      }
    }
  }

  async function restore(version: VersionRow) {
    setRestoring(true);
    try {
      await fetch(`/api/canvas-items/${itemId}/versions/${version.id}/restore`, { method: "POST" });
      setOpen(false);
      onRestored?.();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="nodrag pointer-events-auto">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Versionsverlauf"
        title="Versionsverlauf"
        className="rounded-full p-1 text-muted/70 transition hover:bg-cream hover:text-ink"
      >
        <ClockIcon className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-40 w-72 overflow-hidden rounded-xl border border-hairline bg-surface shadow-panel">
            {selected ? (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="mb-2 text-xs text-muted hover:text-ink"
                >
                  ← Zurück zur Liste
                </button>
                <p className="truncate text-sm font-semibold text-ink">{selected.title}</p>
                <p className="thin-scroll mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted">
                  {selected.content.slice(0, 800) || "Leer"}
                </p>
                <button
                  type="button"
                  onClick={() => restore(selected)}
                  disabled={restoring}
                  className="mt-3 w-full rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
                >
                  {restoring ? "Wird wiederhergestellt …" : "Wiederherstellen"}
                </button>
              </div>
            ) : (
              <div className="thin-scroll max-h-64 overflow-y-auto">
                {loading && <p className="px-3 py-3 text-xs text-muted">Lädt …</p>}
                {!loading && versions.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted">Noch keine früheren Versionen.</p>
                )}
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelected(v)}
                    className="flex w-full items-center justify-between border-b border-hairline px-3 py-2 text-left last:border-0 hover:bg-cream"
                  >
                    <span className="text-xs text-ink">{formatRelativeTime(v.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        v.editedBy === "agent"
                          ? "bg-accent-soft text-accent-strong"
                          : "bg-cream text-muted"
                      }`}
                    >
                      {v.editedBy === "agent" ? "Agent" : "Nutzer"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
