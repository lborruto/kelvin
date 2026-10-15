/** Rooms and devices (spec §6): label checks that mirror the backend, detail rows, sync status. */
import type { SetupDevice, SyncStatus } from '$lib/api/types';
import { fmtDateTime, fmtTime, parisTodayIso } from '$lib/format';
import { locale, m } from '$lib/i18n';

export const MAX_LABEL = 32;
// Control, format (zero-width), surrogate, private-use, unassigned, line and paragraph separators.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
// Device sub-operation words (backend kelvin/setup/client.py RESERVED_SEGMENTS).
const RESERVED = new Set(
  [
    'metadata', 'relocate', 'states', 'deviceType', 'alternativeControllables', 'equivalentControllables',
    'firmwareUpToDate', 'firmwareUpdateCapability', 'updateFirmware', 'updateFirmwares', 'manufacturerReferences',
    'attributes', 'controllable', 'controllables', 'additionalInformation', 'subSystems', '_delete', '_deleteCascade',
    'link', 'refresh', 'notUpToDate', 'hidden'
  ].map((w) => w.toLowerCase())
);

export type LabelProblem = 'empty' | 'long' | 'invisible' | 'dots' | 'taken' | 'reserved';

export function labelProblem(raw: string, opts: { kind: 'room' | 'device'; existing?: string[] }): LabelProblem | null {
  const s = raw.normalize('NFC').trim();
  if (!s) return 'empty';
  if ([...s].length > MAX_LABEL) return 'long';
  if (INVISIBLE.test(s)) return 'invisible';
  if (/^\.+$/.test(s)) return 'dots';
  const key = s.toLowerCase();
  if (opts.kind === 'device' && RESERVED.has(key)) return 'reserved';
  if (opts.kind === 'room' && (opts.existing ?? []).some((e) => e.trim().toLowerCase() === key)) return 'taken';
  return null;
}

export function problemText(p: LabelProblem): string {
  return m.devices.problem[p];
}

type DetailKey = keyof typeof m.devices.detail;
/** Read-only states shown on the device screen, in the backend's order (DETAIL_STATES). */
export const DETAIL_KEYS: Record<string, DetailKey> = {
  'io:ModelState': 'model',
  'core:ManufacturerNameState': 'maker',
  'io:PowerState': 'power',
  'io:TensionState': 'voltage',
  'core:VersionState': 'version',
  'io:UptimeState': 'uptime',
  'core:RSSILevelState': 'rssi',
  'core:DiscreteRSSILevelState': 'rssiLevel',
  'internal:SignalStrengthState': 'wifi',
  'core:ConnectivityState': 'connectivity',
  'io:RunningState': 'running',
  'io:CurrentWorkingRateState': 'workingRate',
  'io:MaximumHeatingLevelState': 'maxLevel',
  'io:CumulatedLoweringState': 'lowering',
  'core:HolidaysModeState': 'holidays',
  'core:DerogatedTargetTemperatureState': 'derogation',
  'io:PeakNoticeState': 'peakNotice',
  'io:PeakWarningState': 'peakWarning'
};
// Model and maker are words, power has a recorded unit; every other value is shown raw with
// its Cozytouch state name until docs/overkiz-notes.md records its scale.
const NOT_RAW = new Set(['io:ModelState', 'core:ManufacturerNameState', 'io:PowerState']);

export interface DetailRow {
  state: string;
  label: string;
  value: string;
  raw: boolean;
}

export function detailRows(d: SetupDevice): DetailRow[] {
  const num = new Intl.NumberFormat(locale.intl);
  return Object.keys(DETAIL_KEYS)
    .filter((state) => state in d.details)
    .map((state) => {
      const v = d.details[state];
      const text = typeof v === 'number' ? num.format(v) : String(v);
      return {
        state,
        label: m.devices.detail[DETAIL_KEYS[state]],
        value: state === 'io:PowerState' && typeof v === 'number' ? m.devices.watts(text) : text,
        raw: !NOT_RAW.has(state)
      };
    });
}

export interface SyncInfo {
  canSync: boolean;
  requested: boolean;
  nextPossibleMs: number | null;
  lastMs: number | null;
  staleSinceMs: number | null;
  nextDailyMs: number;
}

const ms = (s: number | null) => (s === null ? null : s * 1000);

export function syncInfo(s: SyncStatus): SyncInfo {
  return {
    // The server keeps the last read of 24 h for a restart: next_possible_at is null exactly
    // when « Synchroniser » can read now (used < limit is not enough).
    canSync: !s.requested && s.next_possible_at === null,
    requested: s.requested,
    nextPossibleMs: ms(s.next_possible_at),
    lastMs: ms(s.last_full_at),
    staleSinceMs: ms(s.stale_since),
    nextDailyMs: s.next_daily_at * 1000
  };
}

/** A room's name in the active language: the house root is « Maison » / “Home”. */
export function roomName(r: { name: string; is_root?: boolean }): string {
  return r.is_root ? m.devices.home : r.name;
}

/** « à 14:10 » the same Paris day, « le 15 oct. 08:00 » otherwise (active language). */
export function whenText(ms: number, now: number): string {
  return parisTodayIso(ms) === parisTodayIso(now) ? m.devices.atTime(fmtTime(ms)) : m.devices.onDate(fmtDateTime(ms));
}

// Cozytouch's generic sub-device label « IO (8370011#2) », or any label holding a device serial or
// URL: shown as the device's role, never as a serial-like id (owner ruling).
const GENERIC_LABEL = /^IO \(.*\)$/;
const SERIAL_LIKE = /\d{5,}|:\/\//;

/** The label to show for a device: its Cozytouch label, or its role when that label is generic. */
export function deviceLabel(d: SetupDevice): string {
  const label = d.label.trim();
  return !label || GENERIC_LABEL.test(label) || SERIAL_LIKE.test(label) ? m.devices.role[d.role] : label;
}

/** A radiator's title: its name, or « Radiateur » / “Radiator” when that name is Cozytouch's generic
 * label or holds a serial or a device URL (the same rule as deviceLabel). */
export function radiatorName(r: { name: string }): string {
  const name = r.name.trim();
  return !name || GENERIC_LABEL.test(name) || SERIAL_LIKE.test(name) ? m.devices.radiator : name;
}

/** A radiator as the room panel titles it: its own name, else (the device default « Radiateur » or its
 * model says nothing) the model and power, « HEKLA P · 1500 W ». */
export function radiatorTitle(r: { name: string; model?: string | null; power_w: number | null }): string {
  const renamed = !!r.name.trim() && r.name !== 'Radiateur' && r.name !== r.model; // i18n-ignore: upstream device default
  return renamed ? r.name : m.radiator.facts(r.model ?? m.radiator.default, r.power_w);
}
