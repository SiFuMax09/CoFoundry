"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function DocumentModal({
  title: initialTitle,
  content: initialContent,
  onClose,
  onSave,
}: {
  title: string;
  content: string;
  onClose: () => void;
  onSave: (patch: { title: string; content: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title, content });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6 py-10">
      <div className="flex h-full w-full max-w-3xl flex-col rounded-2xl bg-surface shadow-panel">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-6 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-transparent font-display text-lg font-semibold text-ink outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:border-accent"
            >
              {preview ? "Bearbeiten" : "Vorschau"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {saving ? "Speichert …" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="rounded-full p-1.5 text-muted hover:bg-cream"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto px-6 py-5">
          {preview ? (
            <article className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-full w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-ink outline-none"
              placeholder="# Titel

Markdown-Inhalt …"
            />
          )}
        </div>
      </div>
    </div>
  );
}
