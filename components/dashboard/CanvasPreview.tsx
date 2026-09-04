import type { ProjectPreviewItem } from "@/lib/projects";

const TYPE_FILL: Record<string, string> = {
  document: "#ffffff",
  note: "#EDE9FB",
  website: "#ffffff",
  calendar: "#ffffff",
};

/**
 * Statisches SVG-Miniaturbild der Canvas-Items einer Projektkarte — bewusst
 * kein zweites React-Flow, nur eine simple Positions-Projektion.
 */
export function CanvasPreview({ items }: { items: ProjectPreviewItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-t-[calc(var(--radius-card)-1px)] dot-grid">
        <span className="text-xs text-muted">Noch keine Elemente</span>
      </div>
    );
  }

  const padding = 24;
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.width));
  const maxY = Math.max(...items.map((i) => i.y + i.height));
  const viewW = Math.max(maxX - minX + padding * 2, 100);
  const viewH = Math.max(maxY - minY + padding * 2, 80);

  return (
    <svg
      viewBox={`${minX - padding} ${minY - padding} ${viewW} ${viewH}`}
      className="h-32 w-full rounded-t-[calc(var(--radius-card)-1px)] dot-grid"
      preserveAspectRatio="xMidYMid meet"
    >
      {items.slice(0, 40).map((item, i) => (
        <rect
          key={i}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          rx={6}
          fill={item.color ?? TYPE_FILL[item.type] ?? "#ffffff"}
          stroke="rgb(31 29 27 / 0.08)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}
