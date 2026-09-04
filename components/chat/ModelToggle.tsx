"use client";

const OPTIONS = [
  { model: "openai/gpt-5-mini", label: "Standard" },
  { model: "anthropic/claude-sonnet-5", label: "Hochschalten" },
] as const;

export function ModelToggle({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (model: string) => void;
}) {
  const current = value ?? OPTIONS[0].model;

  return (
    <div className="inline-flex rounded-full border border-hairline bg-cream p-0.5 text-xs">
      {OPTIONS.map((opt) => (
        <button
          key={opt.model}
          type="button"
          onClick={() => onChange(opt.model)}
          title={opt.model}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            current === opt.model ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
