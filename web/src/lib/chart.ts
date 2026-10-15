/** Pointer and keyboard math shared by the Énergie charts (pure). */

/** Index of the centre nearest to `x` (ties go to the left one); null when there is none. */
export function nearestIndex(centers: number[], x: number): number | null {
  if (!centers.length) return null;
  let best = 0;
  for (let i = 1; i < centers.length; i++) if (Math.abs(centers[i] - x) < Math.abs(centers[best] - x)) best = i;
  return best;
}

/** The index a key moves to: arrows ±1, Home/End, PageUp/PageDown ±`page` (3 h of half-hours); null for other keys. */
export function stepIndex(key: string, i: number, n: number, page = 6): number | null {
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  switch (key) {
    case 'ArrowRight':
      return clamp(i + 1);
    case 'ArrowLeft':
      return clamp(i - 1);
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    case 'PageUp':
      return clamp(i + page);
    case 'PageDown':
      return clamp(i - page);
    default:
      return null;
  }
}

/** The desktop inspector card's width (spec §3.2.3). */
export const CARD_W = 260;

/** Left edge of the card: right of the bar, else left of it, else centred and clamped inside the chart. */
export function cardLeft(anchorX: number, anchorW: number, containerW: number, cardW = CARD_W, gap = 8): number {
  const right = anchorX + anchorW + gap;
  if (right + cardW <= containerW) return right;
  const left = anchorX - gap - cardW;
  if (left >= 0) return left;
  return Math.max(0, Math.min(containerW - cardW, anchorX + anchorW / 2 - cardW / 2));
}

/** A touch swipe: −1 (to the previous period, finger moving right), +1 (next), or null for a tap or a scroll. */
export function swipeDirection(dx: number, dy: number, min = 48): -1 | 1 | null {
  if (Math.abs(dx) < min || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  return dx < 0 ? 1 : -1;
}
