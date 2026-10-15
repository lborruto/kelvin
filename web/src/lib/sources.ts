// The data sources in one list (direction-2 §3 « /home/sources », DESIGN « Sources »): Cozytouch, Linky,
// RTE EcoWatt and (under a Tempo price) Tempo, each with its Freshness state, a state sentence, its last
// time and its exact rows (L2). The Maison card counts the late ones.
import type { LinkyStatus, SourceStatus, Sources, Status } from './api/types';
import type { FicheRow } from './components/FicheBody.svelte';
import { fmtAgo, fmtDateLong, fmtDateTime, fmtTime } from './format';
import { freshness, type Fresh } from './freshness';
import { linkyFresh, linkyLine, linkyProblem } from './linky';
import { m } from './i18n';

export type SourceKey = 'cozytouch' | 'linky' | 'ecowatt' | 'tempo';

export interface SourceRow {
  key: SourceKey;
  /** A product name: never translated. */
  name: string;
  state: Fresh;
  /** The state sentence (13 px muted). */
  text: string;
  /** The last success, epoch ms (right-aligned time), or null. */
  at: number | null;
  /** The exact rows of its disclosure (L2). */
  rows: FicheRow[];
  bad: boolean;
}

export interface SourcesInput {
  /** Cozytouch status (house store) and whether Kelvin's own stream is up with a loaded house. */
  status: Status;
  live: boolean;
  linky: LinkyStatus | null;
  grid: Sources | null;
}

const ms = (s: number | null | undefined) => (s == null ? null : s * 1000);

function grid(key: 'ecowatt' | 'tempo', name: string, s: SourceStatus, now: number): SourceRow {
  const at = ms(s.last_ok);
  const state: Fresh =
    s.state === 'off' ? 'none' : freshness(key === 'tempo' ? 'tempo' : 'rte-ecowatt', { at, failed: s.state === 'error', waiting: s.state === 'quota' || s.state === 'never' }, now);
  const text =
    s.state === 'ok' && at ? m.sources.ok(fmtTime(at)) : s.state === 'error' && s.error_since ? m.sources.error(fmtTime(s.error_since * 1000)) : s.state === 'quota' ? m.sources.quota : m.sources.never;
  const rows: FicheRow[] = [
    { label: m.sources.lastOk, value: at ? fmtDateTime(at) : '—', note: at ? null : m.sources.never },
    ...(s.error_since ? [{ label: m.sources.errorSince, value: fmtDateTime(s.error_since * 1000) }] : []),
    { label: m.sources.nextRead, value: s.next ? fmtDateTime(s.next * 1000) : '—', note: s.next ? null : m.sources.noNext }
  ];
  return { key, name, state, text, at, rows, bad: s.state === 'error' };
}

/** The rows at `now`, in the page's order. Tempo only when its source is enabled (a Tempo price in force). */
export function sourceRows(input: SourcesInput, now: number): SourceRow[] {
  const out: SourceRow[] = [];
  const st = input.status;
  const at = ms(st.last_ok_at);
  const down = input.live && !st.connected;
  out.push({
    key: 'cozytouch',
    name: 'Cozytouch',
    state: down ? 'bad' : freshness('cozytouch', { at, waiting: !input.live }, now),
    text: down ? m.settings.unreachable : at ? m.sources.cozytouchOk(fmtAgo(at, now)) : m.shell.waiting,
    at,
    rows: [
      { label: m.shell.state, value: !input.live ? m.shell.waiting : st.connected ? m.settings.connected : m.settings.unreachable },
      { label: m.shell.lastRead, value: at ? fmtDateTime(at) : '—', note: at ? null : m.shell.never },
      ...(st.last_error_code ? [{ label: m.shell.lastError, value: m.cozytouch[st.last_error_code] }] : [])
    ],
    bad: down
  });
  const l = input.linky;
  if (l) {
    const lat = ms(l.last_ok_at);
    out.push({
      key: 'linky',
      name: 'Linky',
      state: linkyFresh(l, now),
      text: linkyProblem(l) ?? linkyLine(l) ?? '—',
      at: lat,
      rows: [
        { label: m.sources.lastSync, value: lat ? fmtDateTime(lat) : '—', note: lat ? null : m.sources.never },
        { label: m.sources.lastDay, value: l.last_day ? fmtDateLong(l.last_day) : '—', note: l.last_day ? null : m.sources.never },
        ...(l.retry_at ? [{ label: m.sources.nextRead, value: fmtDateTime(l.retry_at * 1000) }] : []),
        ...(l.configured ? [{ label: m.sources.calls, value: m.linky.calls(l.calls_today, l.budget) }] : [])
      ],
      bad: !!linkyProblem(l)
    });
  }
  if (input.grid) {
    out.push(grid('ecowatt', 'RTE EcoWatt', input.grid.ecowatt, now));
    if (input.grid.tempo.enabled) out.push(grid('tempo', 'Tempo', input.grid.tempo, now));
  }
  return out;
}

/** Sources late or failing (the Maison card: « Tout est à jour » or « 1 source en retard »). */
export const lateCount = (rows: SourceRow[]): number => rows.filter((r) => r.state === 'late' || r.state === 'bad').length;
