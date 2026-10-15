import type { Run } from '$lib/api/types';
import { fmtDateTime, fmtPct, fmtTime } from '$lib/format';
import { m } from '$lib/i18n';

/** Samples are 5-minute: one fetch per 5 minutes of the window's end. */
export function activityKey(roomId: string, startMs: number, endMs: number): string {
  return `${roomId}|${Math.floor(startMs / 1000)}|${Math.floor(endMs / 300_000)}`;
}

/** The exact times of a run, as the radiator reported it (QW4: no inference). */
export function runText(run: Run, long: boolean, kind: 'window' | 'presence'): string {
  const f = long ? fmtDateTime : fmtTime;
  const a = f(run.start * 1000);
  const b = f(run.end * 1000);
  return kind === 'window' ? m.strip.windowRun(a, b) : m.strip.presenceRun(a, b);
}

export function dutyText(duty: number | null | undefined): string {
  return m.room.duty(duty == null ? '—' : fmtPct(duty));
}
