"use client";

import { useEffect, useState } from "react";
import { readSseStream } from "./sse";

type Stage = "dispatching" | "done" | "error";

export function ResearchCard({
  projectId,
  phaseId,
  question,
}: {
  projectId: string;
  phaseId: string;
  question: string;
}) {
  const [stage, setStage] = useState<Stage>("dispatching");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phaseId, question }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(data.error ?? "Recherche fehlgeschlagen.");
            setStage("error");
          }
          return;
        }
        for await (const event of readSseStream(res)) {
          if (cancelled) return;
          if (event.type === "agent_progress") {
            setProgress({ done: event.done as number, total: event.total as number });
          } else if (event.type === "document_created") {
            setTitle(event.title as string);
            setStage("done");
          } else if (event.type === "error") {
            setError(event.message as string);
            setStage("error");
          }
        }
      } catch {
        if (!cancelled) {
          setError("Verbindung unterbrochen.");
          setStage("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-2 rounded-xl border border-accent-softer bg-accent-soft p-3">
      <p className="text-xs font-semibold text-accent-strong">Recherche: {question}</p>
      {stage === "dispatching" && (
        <p className="mt-1 text-xs text-accent-strong">
          {progress ? `${progress.done} von ${progress.total} Agenten fertig …` : "Dispatch startet …"}
        </p>
      )}
      {stage === "done" && (
        <p className="mt-1 text-xs text-ink">
          Fertig — Dokument „{title}“ wurde auf die Canvas geschrieben.
        </p>
      )}
      {stage === "error" && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
