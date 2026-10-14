/**
 * The single source of heat colour: 15 °C cool → 20 °C neutral → 25 °C warm.
 *
 * The stops are the theme tokens --cool / --neutral / --warm (app.css, one set per theme), so every
 * heat colour follows the active theme, including the system scheme, without any runtime lookup.
 * Between two stops the colour is a linear sRGB mix of them, the same interpolation the d3 ramp used.
 */
export const RAMP_DOMAIN = [15, 20, 25] as const;
const STOPS = ['var(--cool)', 'var(--neutral)', 'var(--warm)'] as const;

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

export function heatColor(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return 'var(--fa)';
  const [lo, mid, hi] = RAMP_DOMAIN;
  if (t <= lo) return STOPS[0];
  if (t >= hi) return STOPS[2];
  if (t === mid) return STOPS[1];
  const [a, b, f] = t < mid ? [STOPS[0], STOPS[1], (t - lo) / (mid - lo)] : [STOPS[1], STOPS[2], (t - mid) / (hi - mid)];
  // color-mix weights the first colour: f of the way from a to b means (1 - f) of a.
  return `color-mix(in srgb, ${a} ${pct(1 - f)}, ${b})`;
}
