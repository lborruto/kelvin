// Linky status in words (DESIGN « Linky status wording »): one source for the Linky page, the Maison card and
// the Sources page. Progress is neutral; only `auth` and `error` are problems.
import type { LinkyStatus } from './api/types';
import { fmtDay, fmtTime } from './format';
import { freshness, type Fresh } from './freshness';
import { apiMessage, m } from './i18n';

/** The state line (« Relié · données jusqu’au 14/10 »); null for a problem (see `linkyProblem`). */
export function linkyLine(s: LinkyStatus): string | null {
  if (s.state === 'off') return m.linky.off;
  if (s.state === 'never') return m.linky.never;
  const day = s.last_day ? fmtDay(s.last_day) : null;
  if (s.state === 'ok') return m.linky.ok(day);
  if (s.state === 'quota') return m.linky.quota(day);
  if (s.state === 'throttled') return s.retry_at ? m.linky.throttledAt(day, fmtTime(s.retry_at * 1000)) : m.linky.throttledLater(day);
  return null;
}

/** A problem the user must fix, in the active language (the server's French message as the fallback). */
export function linkyProblem(s: LinkyStatus): string | null {
  return s.state === 'auth' || s.state === 'error' ? apiMessage(`linky_status_${s.state}`, {}, s.message) : null;
}

/** The Freshness mark of the daily reading. */
export function linkyFresh(s: LinkyStatus, now: number): Fresh {
  if (s.state === 'off') return 'none';
  return freshness(
    'linky-day',
    { day: s.last_day, failed: s.state === 'auth' || s.state === 'error', waiting: s.state === 'never' || s.state === 'quota' || s.state === 'throttled' },
    now
  );
}

/** The PDL masked but for its last four digits, grouped like the bill: « •••• •••• ••34 56 ». */
export function maskPdl(prm: string | null): string {
  if (!prm) return '—';
  const masked = prm.replace(/\d(?=\d{4})/g, '•');
  return masked.replace(/(.{4})(?=.)/g, '$1 ').replace(/(\d\d)(\d\d)$/, '$1 $2').replace(/ (?=\d\d \d\d$)/, '');
}
