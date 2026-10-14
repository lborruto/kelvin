/** A room-level value from its radiators' values. */
export interface Agg {
  value: number | null;
  mixed: boolean;
}

/** One value when every radiator agrees, else their mean rounded to 0.5 and flagged as mixed. */
export function agg(vals: (number | null | undefined)[]): Agg {
  const v = vals.filter((x): x is number => typeof x === 'number');
  if (!v.length) return { value: null, mixed: false };
  if (v.every((x) => x === v[0])) return { value: v[0], mixed: false };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { value: Math.round(mean * 2) / 2, mixed: true };
}
