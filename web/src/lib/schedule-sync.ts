import { DAYS, type Day } from './api/types';
import { changedDays, type Base, type Week } from './program';

export interface EditorState {
  draft: Week;
  baseline: Week;
  base: Base;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** An SSE update brought `fresh` (the editor's source radiator, as segments) and `freshBase`
 * (every radiator's programme now) while there are unsent edits.
 * Days changed upstream that the user did not edit follow silently. A day changed upstream (on
 * any radiator of the room) that the user edited is a conflict: edits and base stay, so the
 * backend refuses to overwrite it until « Recharger » or « Remplacer quand même » (owner addition). */
export function follow(s: EditorState, fresh: Week, freshBase: Base): { next: EditorState; conflict: Day[] } {
  const edited = new Set(changedDays(s.baseline, s.draft));
  const upstream = new Set(changedDays(s.baseline, fresh));
  for (const rid of new Set([...Object.keys(s.base), ...Object.keys(freshBase)]))
    for (const d of DAYS) if (!same(s.base[rid]?.[d], freshBase[rid]?.[d])) upstream.add(d);
  const conflict = DAYS.filter((d) => upstream.has(d) && edited.has(d));
  if (!upstream.size) return { next: s, conflict: [] };
  const draft = { ...s.draft };
  const baseline = { ...s.baseline };
  for (const d of DAYS)
    if (upstream.has(d) && !edited.has(d)) {
      draft[d] = fresh[d];
      baseline[d] = fresh[d];
    }
  return { next: { draft, baseline, base: conflict.length ? s.base : freshBase }, conflict };
}
