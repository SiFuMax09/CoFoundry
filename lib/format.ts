/** Relative deutsche Zeitangabe wie "vor 41 Min." für Dashboard-Karten. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 30) return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  const months = Math.round(days / 30);
  return `vor ${months} Monat${months === 1 ? "" : "en"}`;
}
