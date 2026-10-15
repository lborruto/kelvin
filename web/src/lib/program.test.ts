import { describe, expect, it } from 'vitest';
import type { WeekProgram } from './api/types';
import {
  addSlot,
  changedDays,
  comfortBands,
  daySegs,
  fmtNextChange,
  fromMin,
  fromWeekProgram,
  isComfortAt,
  moveSlot,
  nextChange,
  removeSlot,
  resizeSlot,
  snap,
  toMin,
  toWeekProgram,
  validateDay
} from './program';
import { applyLocale } from '$lib/i18n';

const DAY = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const usual: WeekProgram = Object.fromEntries(
  DAY.map((d) => [d, [
    { start: '06:15', end: '08:00' },
    { start: '17:30', end: '22:30' }
  ]])
);

describe('program basics', () => {
  it('minutes conversion and snapping', () => {
    expect(toMin('18:30')).toBe(1110);
    expect(fromMin(1110)).toBe('18:30');
    expect(fromMin(1439)).toBe('23:59');
    expect(snap(1112)).toBe(1110);
    expect(snap(1440)).toBe(1439);
    expect(snap(-5)).toBe(0);
  });
  it('day segments are sorted and parsed', () => {
    expect(daySegs({ monday: [{ start: '17:30', end: '22:30' }, { start: '06:15', end: '08:00' }] }, 'monday')).toEqual([
      { start: 375, end: 480 },
      { start: 1050, end: 1350 }
    ]);
    expect(daySegs({}, 'monday')).toEqual([]);
  });
  it('round trips the week', () => {
    expect(toWeekProgram(fromWeekProgram(usual))).toEqual(usual);
  });
  it('comfort lookup', () => {
    expect(isComfortAt(usual, 'tuesday', 7 * 60)).toBe(true);
    expect(isComfortAt(usual, 'tuesday', 13 * 60)).toBe(false);
    expect(isComfortAt(usual, 'tuesday', 22 * 60 + 30)).toBe(false);
  });
});

describe('next change', () => {
  it('finds the next boundary today', () => {
    const now = Date.parse('2026-10-13T11:48:00Z'); // Tue 13:48 Paris
    const c = nextChange(usual, now)!;
    expect(c.to).toBe('comfort');
    expect(c.atMs).toBe(Date.parse('2026-10-13T15:30:00Z'));
    expect(fmtNextChange(c, now)).toBe('17:30 → Confort');
  });
  it('rolls to tomorrow', () => {
    const now = Date.parse('2026-10-13T21:00:00Z'); // Tue 23:00 Paris
    const c = nextChange(usual, now)!;
    expect(c.to).toBe('comfort');
    expect(fmtNextChange(c, now)).toBe('demain 06:15 → Confort');
  });
  it('is null for an empty week', () => {
    expect(nextChange({}, Date.now())).toBeNull();
  });
});

describe('bands', () => {
  it('returns comfort intervals in ms clipped to the range', () => {
    const start = Date.parse('2026-10-12T22:00:00Z'); // Tue 00:00 Paris
    const end = start + 24 * 3_600_000;
    const bands = comfortBands(usual, start, end);
    expect(bands).toEqual([
      { start: start + 375 * 60_000, end: start + 480 * 60_000 },
      { start: start + 1050 * 60_000, end: start + 1350 * 60_000 }
    ]);
    expect(comfortBands(usual, start + 19 * 3_600_000, end)).toEqual([
      { start: start + 19 * 3_600_000, end: start + 1350 * 60_000 }
    ]);
  });
});

describe('editing', () => {
  const segs = [
    { start: 375, end: 480 },
    { start: 1050, end: 1350 }
  ];
  it('validates', () => {
    expect(validateDay(segs)).toBeNull();
    expect(validateDay([...segs, { start: 600, end: 700 }, { start: 800, end: 900 }])).toBe('tooMany');
    expect(validateDay([{ start: 100, end: 300 }, { start: 200, end: 400 }])).toBe('overlap');
    expect(validateDay([{ start: 300, end: 300 }])).toBe('endBeforeStart');
  });
  it('adds a slot in free space, trimmed to the next slot', () => {
    expect(addSlot(segs, 600)).toEqual([...segs.slice(0, 1), { start: 600, end: 720 }, segs[1]]);
    expect(addSlot(segs, 1020)).toEqual([...segs.slice(0, 1), { start: 1020, end: 1050 }, segs[1]]);
    expect(addSlot(segs, 400)).toBeNull();
    expect(addSlot([...segs, { start: 600, end: 700 }], 800)).toBeNull();
  });
  it('moves within neighbours and the day', () => {
    expect(moveSlot(segs, 0, 60)).toEqual([{ start: 435, end: 540 }, segs[1]]);
    expect(moveSlot(segs, 0, -1000)).toEqual([{ start: 0, end: 105 }, segs[1]]);
    expect(moveSlot(segs, 0, 2000)).toEqual([{ start: 945, end: 1050 }, segs[1]]);
  });
  it('resizes with a 15-minute minimum', () => {
    expect(resizeSlot(segs, 1, 'end', 1380)).toEqual([segs[0], { start: 1050, end: 1380 }]);
    expect(resizeSlot(segs, 1, 'start', 1400)).toEqual([segs[0], { start: 1335, end: 1350 }]);
    expect(resizeSlot(segs, 1, 'start', 100)).toEqual([segs[0], { start: 480, end: 1350 }]);
  });
  it('removes', () => {
    expect(removeSlot(segs, 0)).toEqual([segs[1]]);
  });
  it('diffs weeks', () => {
    const a = fromWeekProgram(usual);
    const b = fromWeekProgram(usual);
    b.monday = [{ start: 375, end: 480 }];
    expect(changedDays(a, b)).toEqual(['monday']);
  });
});

describe('DST days', () => {
  it('comfort bands are at the right wall-clock time on the spring change', () => {
    const start = Date.parse('2026-03-28T23:00:00Z'); // Sun 2026-03-29 00:00 Paris
    const bands = comfortBands(usual, start, Date.parse('2026-03-29T22:00:00Z'));
    expect(bands[0].start).toBe(Date.parse('2026-03-29T04:15:00Z'));
    expect(bands[1].start).toBe(Date.parse('2026-03-29T15:30:00Z'));
  });
  it('comfort bands on the autumn change', () => {
    const start = Date.parse('2026-10-24T22:00:00Z'); // Sun 2026-10-25 00:00 Paris
    const bands = comfortBands(usual, start, Date.parse('2026-10-25T23:00:00Z'));
    expect(bands[0].start).toBe(Date.parse('2026-10-25T05:15:00Z'));
  });
  it('next change rolls onto the spring change day', () => {
    const now = Date.parse('2026-03-28T22:00:00Z'); // Sat 23:00 Paris
    const c = nextChange(usual, now)!;
    expect(c.atMs).toBe(Date.parse('2026-03-29T04:15:00Z'));
    expect(fmtNextChange(c, now)).toBe('demain 06:15 → Confort');
  });
});

describe('adjacent slots', () => {
  it('merges touching slots when finding the next change', () => {
    const p: WeekProgram = Object.fromEntries(
      DAY.map((d) => [d, [{ start: '06:00', end: '08:00' }, { start: '08:00', end: '10:00' }]])
    );
    const now = Date.parse('2026-10-13T05:00:00Z'); // Tue 07:00 Paris
    const c = nextChange(p, now)!;
    expect(c.to).toBe('eco');
    expect(c.atMs).toBe(Date.parse('2026-10-13T08:00:00Z'));
  });
});

describe('next change in each language', () => {
  const now = Date.parse('2026-10-13T11:48:00Z'); // Tue 13:48 Paris
  const thursday: WeekProgram = { thursday: [{ start: '06:15', end: '08:00' }] };
  it('French: today, tomorrow, a weekday in lower case', () => {
    expect(fmtNextChange(nextChange(usual, now)!, now)).toBe('17:30 → Confort');
    expect(fmtNextChange(nextChange(thursday, now)!, now)).toBe('jeudi 06:15 → Confort');
  });
  it('English', () => {
    applyLocale('en');
    expect(fmtNextChange(nextChange(usual, now)!, now)).toBe('17:30 → Comfort');
    const late = Date.parse('2026-10-13T21:00:00Z');
    expect(fmtNextChange(nextChange(usual, late)!, late)).toBe('tomorrow 06:15 → Comfort');
    expect(fmtNextChange(nextChange(thursday, now)!, now)).toBe('Thursday 06:15 → Comfort');
  });
});
