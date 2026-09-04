"use client";

import { useState } from "react";
import { readSseStream } from "./sse";
import { UltraplanProposal } from "./UltraplanProposal";
import type { UltraplanProposalData } from "./ultraplanTypes";

type Stage = "idle" | "dispatching" | "proposed" | "error";

export function UltraplanCard({
  projectId,
  summary,
  onAccepted,
}: {
  projectId: string;
  summary: string;
  onAccepted: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<UltraplanProposalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startUltraplan() {
    setStage("dispatching");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ultraplan`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Ultraplan-Dispatch fehlgeschlagen.");
        setStage("error");
        return;
      }
      for await (const event of readSseStream(res)) {
        if (event.type === "agent_progress") {
          setProgress({ done: event.done as number, total: event.total as number });
        } else if (event.type === "proposal") {
          setRunId(event.runId as string);
          setProposal(event.proposal as UltraplanProposalData);
          setStage("proposed");
        } else if (event.type === "error") {
          setError(event.message as string);
          setStage("error");
        }
      }
    } catch {
      setError("Verbindung unterbrochen.");
      setStage("error");
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-accent-softer bg-accent-soft p-3">
      <p className="text-xs font-semibold text-accent-strong">Bereit für Ultraplan?</p>
      <p className="mt-1 text-xs text-ink">{summary}</p>

      {stage === "idle" && (
        <>
          <p className="mt-2 text-[11px] text-muted">
            Dispatcht mehrere Recherche-Agenten und erzeugt daraus eine erste Phasen-Roadmap. Ca. 3–5 Minuten,
            schätzungsweise $0.30–0.80 über deinen OpenRouter-Key, je nach Anzahl ausgelöster Websuchen ggf. etwas mehr.
          </p>
          <button
            type="button"
            onClick={startUltraplan}
            className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-strong"
          >
            Ultraplan starten
          </button>
        </>
      )}

      {stage === "dispatching" && (
        <p className="mt-2 text-xs text-accent-strong">
          {progress ? `${progress.done} von ${progress.total} Agenten fertig …` : "Dispatch startet …"}
        </p>
      )}

      {stage === "error" && (
        <div className="mt-2">
          <p className="text-xs text-danger">{error}</p>
          <button
            type="button"
            onClick={startUltraplan}
            className="mt-2 rounded-full border border-hairline px-3 py-1.5 text-xs text-ink"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {stage === "proposed" && proposal && runId && (
        <UltraplanProposal
          projectId={projectId}
          runId={runId}
          proposal={proposal}
          onProposalChange={setProposal}
          onAccepted={onAccepted}
        />
      )}
    </div>
  );
}
