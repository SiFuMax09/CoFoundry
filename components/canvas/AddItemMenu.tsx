"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";

export function AddItemMenu({ onAdd }: { onAdd: (type: "document" | "note") => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-6 right-6 z-10">
      {open && (
        <div className="mb-2 w-44 overflow-hidden rounded-xl border border-hairline bg-surface shadow-panel">
          <button
            type="button"
            onClick={() => {
              onAdd("document");
              setOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-cream"
          >
            Dokument
          </button>
          <button
            type="button"
            onClick={() => {
              onAdd("note");
              setOpen(false);
            }}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink hover:bg-cream"
          >
            Notiz
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Neues Element hinzufügen"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-panel transition hover:bg-accent-strong"
      >
        <PlusIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
