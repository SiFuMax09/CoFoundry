"use client";

export function PillSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              value === opt
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-hairline bg-surface text-ink hover:border-accent"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
