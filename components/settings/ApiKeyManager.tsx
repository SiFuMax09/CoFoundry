"use client";

import { useEffect, useState } from "react";

export function ApiKeyManager() {
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/keys")
      .then((r) => r.json())
      .then((data) => setMaskedKey(data.maskedKey ?? null))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!input.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/keys?test=1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Speichern fehlgeschlagen." });
        return;
      }
      setMaskedKey(data.maskedKey);
      setInput("");
      setMessage({ type: "success", text: "Key gespeichert und erfolgreich getestet." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestExisting() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/keys", { method: "POST" });
      const data = await res.json();
      setMessage(
        res.ok
          ? { type: "success", text: "Key funktioniert." }
          : { type: "error", text: data.error ?? "Test fehlgeschlagen." }
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="font-display text-base font-semibold text-ink">OpenRouter-Key</h2>
      <p className="mt-1 text-sm text-muted">
        Einziger Schlüssel für alle KI-Aufrufe und die Websuche — pay-as-you-go über deinen{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="text-accent-strong underline"
        >
          OpenRouter-Account
        </a>
        . Wird verschlüsselt gespeichert, nie im Klartext an den Client zurückgegeben.
      </p>

      {!loading && (
        <p className="mt-3 text-sm text-ink">
          Aktueller Key: <span className="font-mono">{maskedKey ?? "— kein Key hinterlegt —"}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="sk-or-…"
          className="min-w-64 flex-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !input.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {saving ? "Prüft & speichert …" : "Speichern & testen"}
        </button>
        {maskedKey && (
          <button
            type="button"
            onClick={handleTestExisting}
            disabled={testing}
            className="rounded-full border border-hairline px-4 py-2 text-sm text-ink hover:border-accent disabled:opacity-60"
          >
            {testing ? "Testet …" : "Gespeicherten Key testen"}
          </button>
        )}
      </div>

      {message && (
        <p className={`mt-2 text-sm ${message.type === "error" ? "text-danger" : "text-progress"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
