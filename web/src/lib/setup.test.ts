import { afterEach, describe, expect, it } from 'vitest';
import type { SetupDevice, SyncStatus } from '$lib/api/types';
import { applyLocale } from '$lib/i18n';
import { detailRows, deviceLabel, labelProblem, roomName, syncInfo, whenText } from './setup';

const NB = ' ';
afterEach(() => applyLocale('fr'));

describe('labelProblem (mirrors the backend; the server stays the authority)', () => {
  const rooms = { kind: 'room' as const, existing: ['Salon', 'Chambre 1 '] };
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['x'.repeat(33), 'long'],
    ['Bu​reau', 'invisible'],
    ['Bu\nreau', 'invisible'],
    ['..', 'dots'],
    ['salon', 'taken'],
    [' chambre 1', 'taken'],
    ['Salle d’eau / bureau', null],
    ['🛋 Salon', null],
    ['x'.repeat(32), null]
  ])('room %j → %s', (raw, expected) => {
    expect(labelProblem(raw, rooms)).toBe(expected);
  });
  it('a device label may not be a Cozytouch operation word', () => {
    expect(labelProblem('metadata', { kind: 'device' })).toBe('reserved');
    expect(labelProblem('UpdateFirmware', { kind: 'device' })).toBe('reserved');
    expect(labelProblem('Salon', { kind: 'device' })).toBeNull();
  });
});

describe('detailRows', () => {
  const device = (details: SetupDevice['details']): SetupDevice => ({
    id: 'r1#1', role: 'heater', label: 'Radiateur', widget: 'AtlanticElectricalHeater', room_id: 'p-salon',
    misplaced: false, reachable: true, last_event_at: null, details
  });
  it('keeps the backend order, puts W on the power only and keeps other values raw', () => {
    const rows = detailRows(device({ 'core:VersionState': '1.4.0', 'io:PowerState': 1500, 'io:ModelState': 'HEKLA P' }));
    expect(rows.map((r) => [r.label, r.value, r.raw])).toEqual([
      ['Modèle', 'HEKLA P', false],
      ['Puissance', `1 500${NB}W`, false], // Intl's fr-FR group separator, as Plan 7's intFor
      ['Version', '1.4.0', true]
    ]);
    expect(rows[2].state).toBe('core:VersionState');
  });
  it('omits what the device does not report and speaks English', () => {
    applyLocale('en');
    const rows = detailRows(device({ 'io:TensionState': 231, 'core:LocalIPv4AddressState': '192.0.2.1' }));
    expect(rows.map((r) => [r.label, r.value])).toEqual([['Voltage', '231']]);
  });
});

describe('syncInfo and roomName', () => {
  const sync = (extra: Partial<SyncStatus> = {}): SyncStatus => ({
    used: 1, limit: 3, next_possible_at: null, last_full_at: 1_760_000_000, stale_since: null, requested: false,
    next_daily_at: 1_760_050_000, ...extra
  });
  it('can sync while a read is left, says when otherwise, in ms', () => {
    expect(syncInfo(sync())).toMatchObject({ canSync: true, nextPossibleMs: null, lastMs: 1_760_000_000_000 });
    expect(syncInfo(sync({ used: 3, next_possible_at: 1_760_020_000 }))).toMatchObject({
      canSync: false, nextPossibleMs: 1_760_020_000_000
    });
    expect(syncInfo(sync({ requested: true })).canSync).toBe(false);
    // The last read of 24 h stays for a restart: at 2 of 3 the server already says when.
    expect(syncInfo(sync({ used: 2, next_possible_at: 1_760_020_000 }))).toMatchObject({
      canSync: false, nextPossibleMs: 1_760_020_000_000
    });
  });
  it('names the house root in the active language', () => {
    expect(roomName({ name: 'Maison', is_root: true })).toBe('Maison');
    applyLocale('en');
    expect(roomName({ name: 'Maison', is_root: true })).toBe('Home');
    expect(roomName({ name: 'Salon', is_root: false })).toBe('Salon');
  });
});

describe('whenText', () => {
  const now = Date.parse('2026-10-14T10:00:00Z'); // 12:00 in Paris
  it('a time today, a date otherwise, in the active language', () => {
    expect(whenText(Date.parse('2026-10-14T12:10:00Z'), now)).toBe('à 14:10');
    expect(whenText(Date.parse('2026-10-15T08:00:00Z'), now)).toMatch(/^le .*10:00$/);
    applyLocale('en');
    expect(whenText(Date.parse('2026-10-14T12:10:00Z'), now)).toBe('at 14:10');
  });
});

describe('deviceLabel (ruling: never a serial-like id on screen)', () => {
  const d = (label: string, role: SetupDevice['role'] = 'temperature'): SetupDevice => ({
    id: 'r1#2', role, label, widget: 'TemperatureSensor', room_id: 'p-salon', misplaced: false, reachable: null,
    last_event_at: null, details: {}
  });
  it('a Cozytouch generic label or one holding a device serial reads as the role', () => {
    expect(deviceLabel(d('IO (8370011#2)'))).toBe('Sonde de température');
    expect(deviceLabel(d('IO (1698997)', 'bridge'))).toBe('Pont Cozytouch');
    expect(deviceLabel(d('Sonde 14172536#2'))).toBe('Sonde de température');
    expect(deviceLabel(d('io://1234-5678-9012/1#2'))).toBe('Sonde de température');
  });
  it('a label someone chose is kept', () => {
    expect(deviceLabel(d('Radiateur fenêtre', 'heater'))).toBe('Radiateur fenêtre');
    expect(deviceLabel(d('Chambre 2'))).toBe('Chambre 2');
    applyLocale('en');
    expect(deviceLabel(d('IO (8370011#2)'))).toBe('Temperature sensor');
  });
});
