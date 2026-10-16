import { describe, expect, it } from 'vitest';
import type { Radiator, WeekProgram } from './api/types';
import {
  addSlot,
  baseOf,
  changedDays,
  comfortBands,
  comfortMinutes,
  copyDay,
  daySegs,
  fmtDuration,
  fmtNow,
  presetDays,
  shiftDay,
  slotTimes,
  EDIT_MAX,
  fromMin,
  fromWeekProgram,
  isComfortAt,
  lockedDays,
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
    expect(snap(1440)).toBe(1425);
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
  });
  it('rolls to tomorrow', () => {
    const now = Date.parse('2026-10-13T21:00:00Z'); // Tue 23:00 Paris
    const c = nextChange(usual, now)!;
    expect(c.to).toBe('comfort');
    expect(c.atMs).toBe(Date.parse('2026-10-14T04:15:00Z'));
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



describe('midnight and locked days (QW8)', () => {
  it('24:00 reads and formats; the editor never makes an end after 23:45', () => {
    expect(toMin('24:00')).toBe(1440);
    expect(fromMin(1440)).toBe('24:00');
    expect(EDIT_MAX).toBe(1425);
    expect(resizeSlot([{ start: 1300, end: 1380 }], 0, 'end', 1440)).toEqual([{ start: 1300, end: 1425 }]);
    expect(addSlot([], 1410)).toEqual([{ start: 1410, end: 1425 }]); // 23:30–23:45: the last period that fits
    expect(addSlot([], 1420)).toBeNull(); // 23:40 snaps to 23:45: no room left for a 15 min period
    expect(daySegs({ sunday: [{ start: '20:00', end: '24:00' }] }, 'sunday')).toEqual([{ start: 1200, end: 1440 }]);
  });
  it('a locked day is never in the payload', () => {
    const week = fromWeekProgram({ monday: [{ start: '07:00', end: '08:00' }], sunday: [{ start: '20:00', end: '24:00' }] });
    const payload = toWeekProgram(week, ['sunday', 'saturday']);
    expect(Object.keys(payload)).not.toContain('sunday');
    expect(Object.keys(payload)).not.toContain('saturday');
    expect(payload.monday).toEqual([{ start: '07:00', end: '08:00' }]);
  });
  it('locked days are the union over the room, unrecognised first; base is a copy', () => {
    const r = (program_locked: object, program = {}) => ({ id: Math.random().toString(), program, program_locked }) as unknown as Radiator;
    expect(lockedDays([r({ sunday: 'midnight' }), r({ sunday: 'unrecognised', friday: 'midnight' }), r({})])).toEqual({
      sunday: 'unrecognised', friday: 'midnight'
    });
    const a = r({}, { monday: [{ start: '07:00', end: '08:00' }] });
    const base = baseOf([a]);
    (a.program.monday as { start: string }[])[0].start = '06:00';
    expect(base[a.id].monday![0].start).toBe('07:00');
  });
});

describe('Programme page helpers', () => {
  const now = Date.parse('2026-10-15T19:42:00Z'); // Thursday 21:42 Paris
  const week: WeekProgram = {
    ...usual,
    thursday: [{ start: '06:30', end: '08:00' }, { start: '16:30', end: '23:00' }]
  };

  it('« Maintenant » says the level now, when it changes and to what', () => {
    expect(fmtNow(week, now)).toBe('Maintenant\u00a0: Confort · 23:00 → Éco');
    const late = Date.parse('2026-10-15T21:30:00Z'); // 23:30, eco until tomorrow 06:15
    expect(fmtNow(week, late)).toBe('Maintenant\u00a0: Éco · demain 06:15 → Confort');
    const fri = Date.parse('2026-10-16T21:30:00Z'); // Friday night: next comfort on Saturday 08:30? usual has every day
    expect(fmtNow({ monday: [{ start: '07:00', end: '08:00' }] }, fri)).toBe('Maintenant\u00a0: Éco · lundi 07:00 → Confort');
    expect(fmtNow({}, now)).toBe('Maintenant\u00a0: Éco, sans changement cette semaine');
    applyLocale('en');
    expect(fmtNow(week, now)).toBe('Now: Comfort · 23:00 → Eco');
    expect(fmtNow(week, late)).toBe('Now: Eco · tomorrow 06:15 → Comfort');
  });

  it('comfort totals read as durations, in both languages', () => {
    expect(comfortMinutes([{ start: 390, end: 480 }, { start: 990, end: 1380 }])).toBe(480);
    expect(fmtDuration(480)).toBe('8\u00a0h');
    expect(fmtDuration(450)).toBe('7\u00a0h\u00a030');
    expect(fmtDuration(45)).toBe('45\u00a0min');
    applyLocale('en');
    expect(fmtDuration(450)).toBe('7\u00a0h 30\u00a0min');
  });

  it('slot times as text', () => {
    expect(slotTimes([{ start: 390, end: 480 }, { start: 1200, end: 1440 }])).toEqual(['06:30–08:00', '20:00–24:00']);
  });

  it('presets leave out the source day and locked days', () => {
    expect(presetDays('weekdays', 'thursday', {})).toEqual(['monday', 'tuesday', 'wednesday', 'friday']);
    expect(presetDays('weekend', 'monday', { sunday: 'midnight' })).toEqual(['saturday']);
    expect(presetDays('every', 'saturday', { sunday: 'unrecognised' })).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  });

  it('copies one day onto others, never a locked one, as fresh copies', () => {
    const w = fromWeekProgram(usual);
    w.monday = [{ start: 60, end: 120 }];
    const out = copyDay(w, 'monday', ['tuesday', 'sunday', 'monday'], { sunday: 'midnight' });
    expect(out.tuesday).toEqual([{ start: 60, end: 120 }]);
    expect(out.tuesday[0]).not.toBe(w.monday[0]);
    expect(out.sunday).toEqual(w.sunday);
    expect(w.tuesday).not.toEqual(out.tuesday); // the input is untouched
  });

  it('previous and next day wrap around the week', () => {
    expect(shiftDay('monday', -1)).toBe('sunday');
    expect(shiftDay('sunday', 1)).toBe('monday');
    expect(shiftDay('wednesday', 1)).toBe('thursday');
  });
});
