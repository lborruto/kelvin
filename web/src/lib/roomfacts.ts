import type { Radiator } from '$lib/api/types';
import { fmtAgo, fmtDateTime, fmtTime } from '$lib/format';
import { m } from '$lib/i18n';
import { parisMidnight } from '$lib/time';

export interface InfoRow {
  key: 'model' | 'power' | 'signal' | 'reach' | 'last';
  label: string;
  value: string;
  bad?: boolean;
}

/** « Joignable », « Hors ligne depuis 14:05 » (a date when it began another day), « Hors ligne »
 * when Kelvin does not know since when, « — » when the radiator does not report it. Never `bad`:
 * a radiator switched off at the mains is a normal state (DESIGN: State Red). */
export function reachText(r: Radiator, now: number): { text: string; bad: boolean } {
  if (r.reachable == null) return { text: '—', bad: false };
  if (r.reachable) return { text: m.roomInfo.reachable, bad: false };
  if (r.unreachable_since == null) return { text: m.roomInfo.unreachable, bad: false };
  const ms = r.unreachable_since * 1000;
  const when = parisMidnight(ms) === parisMidnight(now) ? fmtTime(ms) : fmtDateTime(ms);
  return { text: m.roomInfo.unreachableSince(when), bad: false };
}

/** QW3: model, power, signal (raw RSSI: no recorded scale), reachability, last signal. */
export function infoRows(r: Radiator, now: number): InfoRow[] {
  const reach = reachText(r, now);
  return [
    { key: 'model', label: m.roomInfo.model, value: r.model ?? '—' },
    { key: 'power', label: m.roomInfo.power, value: r.power_w == null ? '—' : m.roomInfo.watts(r.power_w) },
    { key: 'signal', label: m.roomInfo.signal, value: r.rssi == null ? '—' : m.roomInfo.rssi(Math.round(r.rssi)) },
    { key: 'reach', label: m.roomInfo.reachability, value: reach.text, bad: reach.bad },
    { key: 'last', label: m.roomInfo.lastSignal, value: r.last_event_at == null ? '—' : fmtAgo(r.last_event_at * 1000, now) }
  ];
}

export interface LivePower {
  /** Σ working_rate/100 × power_w over the radiators heating now (W). */
  watts: number;
  parts: { radiator: Radiator; rate: number; power: number }[];
}

/** The live heating power of a room (direction-2 §1.3, « Détails techniques »): derived from the device
 * (Nature « calculé »), shown « ≈ ». Null when nothing heats, and when a heating radiator has no known
 * power: a partial sum is never passed off as the room's. Offline radiators report nothing current. */
export function livePower(rads: Radiator[]): LivePower | null {
  const heating = rads.filter((r) => r.reachable !== false && (r.working_rate ?? 0) > 0);
  if (!heating.length || heating.some((r) => r.power_w == null)) return null;
  const parts = heating.map((r) => ({ radiator: r, rate: r.working_rate as number, power: r.power_w as number }));
  return { watts: Math.round(parts.reduce((s, p) => s + (p.rate / 100) * p.power, 0)), parts };
}

/** A radiator row's inline facts with « Détails techniques » on: the raw signal and the last event. */
export function detailFacts(r: Radiator, now: number): string[] {
  const out: string[] = [];
  if (r.rssi != null) out.push(m.roomInfo.rssi(Math.round(r.rssi)));
  if (r.last_event_at != null) out.push(m.roomInfo.lastSignalInline(fmtAgo(r.last_event_at * 1000, now)));
  return out;
}
