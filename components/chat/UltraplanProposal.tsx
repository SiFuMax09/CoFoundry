"use client";

import { useState } from "react";
import type { UltraplanProposalData } from "./ultraplanTypes";

export function UltraplanProposal({
  projectId,
  runId,
  proposal,
  onProposalChange,
  onAccepted,
}: {
  projectId: string;
  runId: string;
  proposal: UltraplanProposalData;
  onProposalChange: (proposal: UltraplanProposalData) => void;
  onAccepted: () => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ultraplan/${runId}/accept`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Übernehmen fehlgeschlagen.");
        return;
      }
      onAccepted();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevise() {
    if (!instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ultraplan/${runId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Anpassen fehlgeschlagen.");
        return;
      }
      onProposalChange(data.proposal);
      setAdjusting(false);
      setInstruction("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-hairline bg-surface p-3">
      <p className="text-xs font-semibold text-ink">Vorgeschlagene Roadmap</p>

      <ol className="space-y-2">
        {proposal.phases.map((phase, i) => {
          const cards = proposal.starter_cards.filter((c) => c.phase_index === i);
          return (
            <li key={i} className="rounded-lg border border-hairline p-2.5">
              <p className="text-xs font-semibold text-ink">
                {i + 1}. {phase.title}
              </p>
              <p className="mt-0.5 text-xs text-muted">{phase.goal}</p>
              {cards.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {cards.map((c, ci) => (
                    <li
                      key={ci}
                      className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-strong"
                    >
                      {c.type === "note" ? "Notiz" : "Dokument"}: {c.title}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border border-hairline p-2.5">
        <p className="text-xs font-semibold text-ink">Projekt-Briefing (wird auf die Canvas geschrieben)</p>
        <p className="mt-0.5 text-xs text-muted">{proposal.briefing_document.title}</p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {adjusting ? (
        <div className="space-y-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Was soll anders sein? (z. B. „mehr Fokus auf Marketing“)"
            rows={2}
            className="w-full resize-none rounded-lg border border-hairline bg-cream px-2.5 py-1.5 text-xs outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRevise}
              disabled={busy || !instruction.trim()}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "…" : "Anpassung senden"}
            </button>
            <button
              type="button"
              onClick={() => setAdjusting(false)}
              className="rounded-full border border-hairline px-3 py-1.5 text-xs text-ink"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={busy}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "…" : "Roadmap übernehmen"}
          </button>
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            disabled={busy}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs text-ink hover:border-accent"
          >
            Anpassen
          </button>
        </div>
      )}
    </div>
  );
}
