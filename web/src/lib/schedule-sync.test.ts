import { describe, expect, it } from 'vitest';
import { fromWeekProgram } from './program';
import { follow } from './schedule-sync';

const w = (p: object) => fromWeekProgram(p as never);
const MON = { monday: [{ start: '07:00', end: '08:00' }] };
const TUE = { tuesday: [{ start: '18:00', end: '20:00' }] };

describe('follow: an SSE update while the editor has unsent edits', () => {
  const baseline = w({});
  const base = { a: {} };

  it('an untouched day follows silently and the base moves on', () => {
    const draft = w(MON); // Monday edited
    const r = follow({ draft, baseline, base }, w(TUE), { a: TUE });
    expect(r.conflict).toEqual([]);
    expect(r.next.draft.tuesday).toEqual([{ start: 1080, end: 1200 }]);
    expect(r.next.draft.monday).toEqual([{ start: 420, end: 480 }]);
    expect(r.next.baseline.tuesday).toEqual([{ start: 1080, end: 1200 }]);
    expect(r.next.base).toEqual({ a: TUE });
  });

  it('a change on an edited day is a conflict: edits and base stay', () => {
    const draft = w(MON);
    const r = follow({ draft, baseline, base }, w({ monday: [{ start: '05:00', end: '06:00' }] }), {
      a: { monday: [{ start: '05:00', end: '06:00' }] }
    });
    expect(r.conflict).toEqual(['monday']);
    expect(r.next.draft.monday).toEqual([{ start: 420, end: 480 }]);
    expect(r.next.base).toEqual(base);
  });

  it('another radiator of the room changing an edited day is a conflict too', () => {
    const draft = w(MON);
    const r = follow({ draft, baseline, base: { a: {}, b: {} } }, w({}), { a: {}, b: { monday: [{ start: '05:00', end: '06:00' }] } });
    expect(r.conflict).toEqual(['monday']);
  });

  it('nothing changed upstream: nothing moves', () => {
    const draft = w(MON);
    const r = follow({ draft, baseline, base }, baseline, base);
    expect(r).toEqual({ next: { draft, baseline, base }, conflict: [] });
  });
});
