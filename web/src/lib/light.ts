/** Night-light brightness steps (spec QW2): 1 %, then multiples of 5 up to 100 %. */
export function snapIntensity(v: number): number {
  if (!Number.isFinite(v) || v <= 3) return 1;
  return Math.min(100, Math.round(v / 5) * 5);
}

const DELTA: Record<string, number> = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 25, PageDown: -25 };

/** The value a key moves to, or null for a key the slider does not handle. */
export function stepIntensity(v: number, key: string): number | null {
  if (key === 'Home') return 1;
  if (key === 'End') return 100;
  const d = DELTA[key];
  if (d === undefined) return null;
  return snapIntensity((v === 1 && d > 0 ? 0 : v) + d);
}
