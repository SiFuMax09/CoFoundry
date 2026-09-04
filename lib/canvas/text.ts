/** Entfernt Markdown-Syntax für kompakte Vorschauen (Canvas-Karten, get_canvas_overview). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/[#*_`>[\]]/g, "")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " ")
    .trim();
}

export function summarize(md: string, maxLength = 160): string {
  const stripped = stripMarkdown(md);
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trimEnd()}…`;
}
