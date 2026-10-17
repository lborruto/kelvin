import { describe, expect, it } from 'vitest';
import type { Radiator, WeekProgram } from './api/types';
import {
  drawSlot,
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
  lastEnd,
  roomStep,
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
    expect(snap(1440)).toBe(1410); // 30-minute step by default: 23:30 at the latest
    expect(snap(1065)).toBe(1080); // 17:45 is not a time a Sauter radiator keeps
    expect(snap(1112, 15)).toBe(1110);
    expect(snap(1440, 15)).toBe(1425);
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
    expect(moveSlot(segs, 0, 60, 15)).toEqual([{ start: 435, end: 540 }, segs[1]]);
    expect(moveSlot(segs, 0, -1000, 15)).toEqual([{ start: 0, end: 105 }, segs[1]]);
    expect(moveSlot(segs, 0, 2000, 15)).toEqual([{ start: 945, end: 1050 }, segs[1]]);
    // A 06:15 period (held by a radiator) moved on a 30-minute step lands on the step.
    expect(moveSlot(segs, 0, 60)).toEqual([{ start: 450, end: 555 }, segs[1]]);
  });
  it('resizes with a one-step minimum', () => {
    expect(resizeSlot(segs, 1, 'end', 1380, 15)).toEqual([segs[0], { start: 1050, end: 1380 }]);
    expect(resizeSlot(segs, 1, 'start', 1400, 15)).toEqual([segs[0], { start: 1335, end: 1350 }]);
    expect(resizeSlot(segs, 1, 'start', 100, 15)).toEqual([segs[0], { start: 480, end: 1350 }]);
    expect(resizeSlot(segs, 1, 'start', 1400)).toEqual([segs[0], { start: 1320, end: 1350 }]);
    expect(resizeSlot(segs, 1, 'start', 1065)).toEqual([segs[0], { start: 1080, end: 1350 }]); // 17:45 → 18:00
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
  it('24:00 reads and formats; the editor never makes an end after the last step (23:30 at 30 min)', () => {
    expect(toMin('24:00')).toBe(1440);
    expect(fromMin(1440)).toBe('24:00');
    expect(EDIT_MAX).toBe(1410);
    expect(lastEnd(15)).toBe(1425);
    expect(resizeSlot([{ start: 1290, end: 1380 }], 0, 'end', 1440)).toEqual([{ start: 1290, end: 1410 }]);
    expect(addSlot([], 1380)).toEqual([{ start: 1380, end: 1410 }]); // 23:00–23:30: the last period that fits
    expect(addSlot([], 1400)).toBeNull(); // 23:20 snaps to 23:30: no room left for a 30 min period
    expect(resizeSlot([{ start: 1300, end: 1380 }], 0, 'end', 1440, 15)).toEqual([{ start: 1300, end: 1425 }]);
    expect(addSlot([], 1410, 120, 15)).toEqual([{ start: 1410, end: 1425 }]);
    expect(addSlot([], 1420, 120, 15)).toBeNull();
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

describe('the programme step (Sauter keeps 30-minute times, 2026-10-17)', () => {
  it('a room takes the coarsest step of its radiators; none named is 30', () => {
    const r = (step: number | null | undefined) => ({ capabilities: step === undefined ? undefined : { program_step_minutes: step } }) as never;
    expect(roomStep([])).toBe(30);
    expect(roomStep([r(undefined), r(null)])).toBe(30);
    expect(roomStep([r(30), r(60)])).toBe(60);
  });
});

describe('drawSlot (the agenda draws a period)', () => {
  const day = [{ start: 390, end: 480 }, { start: 1020, end: 1380 }];
  it('down: from the origin, an hour at least, snapped', () => {
    expect(drawSlot(day, 721, 730)).toEqual([day[0], { start: 720, end: 780 }, day[1]]);
    expect(drawSlot(day, 720, 868, 60, 15)).toEqual([day[0], { start: 720, end: 870 }, day[1]]);
    expect(drawSlot(day, 720, 868)).toEqual([day[0], { start: 720, end: 870 }, day[1]]);
    expect(drawSlot(day, 720, 856)).toEqual([day[0], { start: 720, end: 870 }, day[1]]); // 14:16 → 14:30
  });
  it('up: from the pointer to the origin, an hour at least', () => {
    expect(drawSlot(day, 720, 700, 60, 15)).toEqual([day[0], { start: 705, end: 765 }, day[1]]);
    expect(drawSlot(day, 720, 557, 60, 15)).toEqual([day[0], { start: 555, end: 720 }, day[1]]);
    expect(drawSlot(day, 720, 557)).toEqual([day[0], { start: 570, end: 720 }, day[1]]);
  });
  it('stays in its gap and never ends after the last step', () => {
    expect(drawSlot(day, 720, 0)).toEqual([day[0], { start: 480, end: 720 }, day[1]]);
    expect(drawSlot(day, 720, 1439)).toEqual([day[0], { start: 720, end: 1020 }, day[1]]);
    expect(drawSlot([], 1400, 1439, 60, 15)).toEqual([{ start: 1395, end: 1425 }]);
    expect(drawSlot([], 1390, 1439)).toEqual([{ start: 1380, end: 1410 }]);
  });
  it('refuses a full day, an origin inside a period, a gap under 15 min', () => {
    expect(drawSlot([...day, { start: 600, end: 660 }].sort((a, b) => a.start - b.start), 900, 960)).toBeNull();
    expect(drawSlot(day, 400, 600)).toBeNull();
    expect(drawSlot([{ start: 0, end: 600 }, { start: 610, end: 700 }], 602, 650)).toBeNull();
  });
});
