"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ApiPhase } from "@/components/canvas/types";
import { readSseStream } from "./sse";
import { describeToolCall } from "./describeTool";
import { ModelToggle } from "./ModelToggle";
import { ReadyStrip } from "./ReadyStrip";
import { UltraplanCard } from "./UltraplanCard";
import type { DisplayMessage, ChatMessageRow } from "./types";

function rowToDisplay(row: ChatMessageRow): DisplayMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  const toolCalls = row.toolCalls
    ? (JSON.parse(row.toolCalls) as Array<{ function: { name: string; arguments: string } }>).map((c) => ({
        name: c.function.name,
        label: describeToolCall(c.function.name, c.function.arguments),
      }))
    : [];
  return { id: row.id, role: row.role, content: row.content, toolCalls };
}

export function ChatPanel({
  projectId,
  phases,
  onPhasesChanged,
}: {
  projectId: string;
  phases: ApiPhase[];
  onPhasesChanged: () => Promise<void>;
}) {
  const activePhase = phases.find((p) => p.status === "active") ?? null;
  const isLastPhase = activePhase ? phases.every((p) => p.order <= activePhase.order) : false;
  const nextPhase = activePhase ? phases.find((p) => p.order === activePhase.order + 1) ?? null : null;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activePhaseId = activePhase?.id ?? null;

  // setState läuft hier bewusst innerhalb einer async IIFE statt direkt im
  // Effekt-Body (react-hooks/set-state-in-effect) — Laden der Chat-Historie
  // bei Phasenwechsel ist waschechtes Daten-Fetching, kein Fall für ein
  // Hook-loses Pattern.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!activePhaseId) {
        setMessages([]);
        return;
      }
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/phases/${activePhaseId}/messages`);
        const data = await res.json();
        if (cancelled) return;
        const rows = (data.messages as ChatMessageRow[]) ?? [];
        setMessages(rows.map(rowToDisplay).filter((m): m is DisplayMessage => m !== null));
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePhaseId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function sendMessage() {
    if (!activePhase || !input.trim() || sending) return;
    const userText = input.trim();
    setInput("");
    setSending(true);

    const userMsgId = `local-user-${Date.now()}`;
    const assistantMsgId = `local-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: userText, toolCalls: [] },
      { id: assistantMsgId, role: "assistant", content: "", toolCalls: [], pending: true },
    ]);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, phaseId: activePhase.id, message: userText, taskType: "active_chat" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: data.error ?? "Fehler bei der Anfrage.", pending: false } : m
          )
        );
        return;
      }

      let phaseChanged = false;
      for await (const event of readSseStream(res)) {
        if (event.type === "token") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + (event.delta as string) } : m))
          );
        } else if (event.type === "tool_call") {
          const label = event.summary as string;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, toolCalls: [...m.toolCalls, { name: event.name as string, label }] }
                : m
            )
          );
          if (event.name === "set_phase_ready" || event.name === "clear_phase_ready" || event.name === "update_phase") {
            phaseChanged = true;
          }
        } else if (event.type === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: `${m.content}\n\n⚠️ ${event.message}`, pending: false } : m
            )
          );
        }
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, pending: false } : m)));
      if (phaseChanged) await onPhasesChanged();
    } finally {
      setSending(false);
    }
  }

  async function advancePhase() {
    if (!activePhase || !nextPhase) return;
    await fetch(`/api/phases/${activePhase.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    await fetch(`/api/phases/${nextPhase.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await onPhasesChanged();
  }

  async function extendRoadmap(title: string) {
    if (!activePhase) return;
    await fetch(`/api/phases/${activePhase.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const res = await fetch(`/api/projects/${projectId}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (data.phase?.id) {
      await fetch(`/api/phases/${data.phase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
    }
    await onPhasesChanged();
  }

  async function changeChatModel(model: string) {
    if (!activePhase) return;
    await fetch(`/api/phases/${activePhase.id}/chat-model`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    await onPhasesChanged();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute left-4 top-4 z-20 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-panel hover:bg-cream"
      >
        Chat öffnen
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-20 flex h-[calc(100%-2rem)] w-96 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface shadow-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-3">
        <p className="truncate text-sm font-semibold text-ink">{activePhase?.title ?? "Kein Chat"}</p>
        <div className="flex items-center gap-2">
          <ModelToggle value={activePhase?.activeChatModel ?? null} onChange={changeChatModel} />
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Chat einklappen"
            className="rounded-full p-1 text-muted hover:bg-cream hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {loadingHistory && <p className="text-xs text-muted">Lädt …</p>}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-xs text-muted">
            Noch keine Nachrichten. Schreib los — dein AI-Co-Founder hilft dir, {activePhase?.goal || "loszulegen"}.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-white" : "bg-cream text-ink"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || (m.pending ? "…" : "")}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.toolCalls.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-ink/10 pt-1.5">
                  {m.toolCalls.map((tc, i) => (
                    <li key={i} className="text-[11px] text-muted">
                      → {tc.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {activePhase?.order === 0 && activePhase.readySummary && (
          <UltraplanCard projectId={projectId} summary={activePhase.readySummary} onAccepted={onPhasesChanged} />
        )}
      </div>

      <div className="shrink-0 border-t border-hairline px-4 py-3">
        {activePhase && activePhase.order > 0 && activePhase.readySummary && (
          <ReadyStrip
            nextPhaseTitle={nextPhase?.title ?? null}
            isLastPhase={isLastPhase}
            onAdvance={advancePhase}
            onExtendRoadmap={extendRoadmap}
          />
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={activePhase ? "Nachricht schreiben …" : "Keine aktive Phase"}
            disabled={!activePhase || sending}
            rows={1}
            className="thin-scroll max-h-32 flex-1 resize-none rounded-xl border border-hairline bg-cream px-3 py-2 text-sm text-ink outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!activePhase || !input.trim() || sending}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
          >
            Senden
          </button>
        </form>
      </div>
    </div>
  );
}
