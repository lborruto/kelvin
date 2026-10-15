import type { DeviceRole, SetupDevice, SetupView } from '$lib/api/types';

const WIDGET: Record<DeviceRole, string> = {
  heater: 'AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint',
  temperature: 'TemperatureSensor',
  window: 'ContactSensor',
  occupancy: 'OccupancySensor',
  energy: 'CumulativeElectricPowerConsumptionSensor',
  light: 'DimmerLight',
  bridge: 'IOStack',
  box: 'Pod',
  wifi: 'Wifi',
  other: 'Other'
};

// Not a *.test.ts file, so the strict i18n scan reads it: the upstream labels below are data.
export const device = (id: string, role: DeviceRole, extra: Partial<SetupDevice> = {}): SetupDevice => ({
  id, role, label: role === 'heater' ? 'Radiateur' : `IO (${id})`, widget: WIDGET[role], room_id: 'p-salon', // i18n-ignore: upstream device default
  misplaced: false, reachable: null, last_event_at: null, details: {}, ...extra
});

/** Invented data shaped like GET /api/setup/devices. */
export function setupFixture(): SetupView {
  return {
    rooms: [
      { id: 'p-house', name: 'Maison', is_root: true, radiator_ids: [], device_count: 2, block: 'room_protected' }, // i18n-ignore: the backend's root name, a data value
      { id: 'p-salon', name: 'Salon', is_root: false, radiator_ids: ['r1'], device_count: 6, block: 'room_not_empty' },
      { id: 'p-bureau', name: 'Bureau', is_root: false, radiator_ids: [], device_count: 0, block: null }
    ],
    radiators: [
      {
        id: 'r1', room_id: 'p-salon', name: 'Radiateur', // i18n-ignore: the heater's upstream label, a data value
        devices: [
          device('r1#1', 'heater', {
            reachable: true, last_event_at: 1_760_000_000,
            details: { 'io:ModelState': 'HEKLA P', 'io:PowerState': 1500, 'core:VersionState': '1.4.0' }
          }),
          device('r1#2', 'temperature', { reachable: true }),
          device('r1#3', 'window'),
          device('r1#4', 'occupancy'),
          device('r1#5', 'energy'),
          device('r1#6', 'light')
        ]
      }
    ],
    bridges: [
      device('bridge-1', 'box', { label: 'Box Cozytouch', room_id: 'p-house', reachable: true, details: { 'core:ConnectivityState': 'online' } }),
      device('bridge-2', 'bridge', { label: 'IO (1)', room_id: 'p-house' })
    ],
    sync: {
      used: 1, limit: 3, next_possible_at: null, last_full_at: 1_760_000_000, stale_since: null, requested: false,
      next_daily_at: 1_760_050_000
    }
  };
}
