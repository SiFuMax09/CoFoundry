export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect, gap = 24): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Platziert ein neues Item radial um ein Ursprungs-Item herum (z. B. ein
 * Agent-Hub oder das Item, mit dem es per link_items verbunden wurde), ohne
 * bestehende Items zu überlappen. Einfacher Kollisions-Check statt eines
 * vollen Force-Layouts — reicht für die Größenordnung an Items pro Projekt.
 */
export function placeRadially(
  origin: Rect,
  size: { width: number; height: number },
  existing: Rect[]
): { x: number; y: number } {
  const originCenterX = origin.x + origin.width / 2;
  const originCenterY = origin.y + origin.height / 2;

  const ringStep = 60;
  const angleStep = (Math.PI * 2) / 8;

  for (let ring = 1; ring <= 8; ring++) {
    const radius = (Math.max(origin.width, origin.height) / 2 + ringStep * ring);
    for (let i = 0; i < 8; i++) {
      const angle = i * angleStep + (ring % 2 === 0 ? angleStep / 2 : 0);
      const x = originCenterX + radius * Math.cos(angle) - size.width / 2;
      const y = originCenterY + radius * Math.sin(angle) - size.height / 2;
      const candidate: Rect = { x, y, width: size.width, height: size.height };
      if (!existing.some((item) => overlaps(candidate, item))) {
        return { x, y };
      }
    }
  }

  // Fallback: weit rechts vom letzten Item, falls alle Ringe belegt sind.
  const maxRight = existing.reduce((max, item) => Math.max(max, item.x + item.width), origin.x);
  return { x: maxRight + 80, y: origin.y };
}

/**
 * Server-seitiger Default für Agent-Tools ohne Bezug zu einem bestehenden
 * Item (kein Viewport bekannt, anders als beim manuellen "+"-Button im
 * Client): platziert rechts neben der bisherigen Bounding-Box aller Items,
 * damit neue Karten nicht übereinander landen. Wird ggf. sofort danach durch
 * einen link_items-Aufruf per placeRadially überschrieben.
 */
export function placeDefault(existing: Rect[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 };
  const maxRight = existing.reduce((max, item) => Math.max(max, item.x + item.width), -Infinity);
  const minY = existing.reduce((min, item) => Math.min(min, item.y), Infinity);
  return { x: maxRight + 80, y: minY };
}

/**
 * Platziert ein neues Item ohne Bezug zu einem bestehenden Item — mittig im
 * aktuell sichtbaren Ausschnitt der Canvas, mit leichter Kollisionsvermeidung.
 */
export function placeInViewport(
  viewport: Rect,
  size: { width: number; height: number },
  existing: Rect[]
): { x: number; y: number } {
  const centerX = viewport.x + viewport.width / 2 - size.width / 2;
  const centerY = viewport.y + viewport.height / 2 - size.height / 2;

  let candidate: Rect = { x: centerX, y: centerY, width: size.width, height: size.height };
  let attempt = 0;
  while (existing.some((item) => overlaps(candidate, item)) && attempt < 12) {
    attempt += 1;
    candidate = {
      ...candidate,
      x: centerX + attempt * 32,
      y: centerY + attempt * 32,
    };
  }
  return { x: candidate.x, y: candidate.y };
}
