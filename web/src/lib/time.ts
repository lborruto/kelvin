import type { Day } from './api/types';

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'long'
});

export interface ParisParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: Day;
}

export function parisParts(ms: number): ParisParts {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday.toLowerCase() as Day
  };
}

function offsetMs(ms: number): number {
  const p = parisParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of 00:00 Europe/Paris on the Paris calendar day containing `ms`. */
export function parisMidnight(ms: number): number {
  const p = parisParts(ms);
  const guess = Date.UTC(p.year, p.month - 1, p.day);
  let t = guess - offsetMs(guess);
  // A DST change between the guess and local midnight shifts the offset; correct once.
  t = guess - offsetMs(t);
  return t;
}

export function parisMinuteOfDay(ms: number): number {
  const p = parisParts(ms);
  return p.hour * 60 + p.minute;
}

/** Local midnight `n` Paris days after `midnightMs` (handles 23/25-hour days). */
export function addParisDays(midnightMs: number, n: number): number {
  return parisMidnight(midnightMs + n * 86_400_000 + 12 * 3_600_000);
}

/**
 * Epoch ms of the Paris wall-clock `minute` (minutes since midnight) on the Paris day starting at `midnightMs`.
 * Times in the skipped spring hour map forward; times in the repeated autumn hour take the first occurrence.
 */
export function parisAt(midnightMs: number, minute: number): number {
  const p = parisParts(midnightMs);
  const target = Date.UTC(p.year, p.month - 1, p.day, 0, minute);
  const offA = offsetMs(midnightMs);
  const offB = offsetMs(midnightMs + 24 * 3_600_000);
  const valid = [target - offA, target - offB]
    .filter((c) => c + offsetMs(c) === target)
    .sort((a, b) => a - b);
  return valid.length ? valid[0] : target - offA;
}
