import type {
  CommandResult,
  EnergyBucket,
  EnergyDay,
  EnergyGroup,
  EnergyReport,
  HistoryPoint,
  LinkyStatus,
  Me,
  RoomActivity,
  RoomEnergy,
  RoomsDuty,
  SetpointKind,
  SettableMode,
  SettingsView,
  Snapshot,
  TariffInput,
  WeekProgram
} from './types';
import type { ApiParams } from '$lib/i18n';
import type { Base } from '$lib/program';

export class ApiError extends Error {
  status: number;
  code: string | null;
  params: ApiParams;
  /** `message` is the backend's French `detail` (or ''), kept as a fallback; the UI shows
   * errorText(e), which translates `code`. */
  constructor(status: number, message: string, code: string | null = null, params: ApiParams = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
    this.name = 'ApiError';
  }
}

let onLoginRequired: (() => void) | null = null;

/** Called on every 401 `login_required` (no session, or Kelvin awaiting its Cozytouch login). */
export function setLoginRequiredHandler(fn: (() => void) | null): void {
  onLoginRequired = fn;
}

const enc = encodeURIComponent;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-Kelvin'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, '', 'network');
  }
  if (!res.ok) {
    let detail = '';
    let code: string | null = null;
    let params: ApiParams = {};
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
      if (typeof data?.code === 'string') code = data.code;
      if (data?.params && typeof data.params === 'object') params = data.params;
    } catch {
      /* body was not JSON */
    }
    // A 503 carries Kelvin's own message (Cozytouch or MyElectricalData unreachable); other 5xx
    // details are internal and never shown.
    if (res.status >= 500 && res.status !== 503) [detail, code, params] = ['', 'server', {}];
    else if (!code && !detail) code = 'unexpected';
    if (res.status === 401 && code === 'login_required') onLoginRequired?.();
    throw new ApiError(res.status, detail, code, params);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const cmd = (method: string, path: string, body?: unknown) => call<CommandResult>(method, path, body);

const programOpts = (o: { base?: Base; force?: boolean }) => ({
  ...(o.base ? { base: o.base } : {}),
  ...(o.force ? { force: true } : {})
});

export const api = {
  me: () => call<Me>('GET', '/auth/me'),
  login: (email: string, password: string) => call<Me>('POST', '/auth/login', { email, password }),
  logout: () => call<Me>('POST', '/auth/logout'),
  house: () => call<Snapshot>('GET', '/house'),

  roomMode: (roomId: string, mode: SettableMode) => cmd('POST', `/rooms/${enc(roomId)}/mode`, { mode }),
  roomSetpoint: (roomId: string, kind: SetpointKind, value: number) =>
    cmd('POST', `/rooms/${enc(roomId)}/setpoint`, { kind, value }),
  roomProgram: (roomId: string, week: WeekProgram, opts: { base?: Base; force?: boolean } = {}) =>
    cmd('PUT', `/rooms/${enc(roomId)}/program`, { ...week, ...programOpts(opts) }),
  roomEnergy: (roomId: string, days: number) => call<RoomEnergy>('GET', `/rooms/${enc(roomId)}/energy?days=${days}`),
  roomActivity: (roomId: string, start: number, end: number) =>
    call<RoomActivity>('GET', `/rooms/${enc(roomId)}/activity?start=${start}&end=${end}`),
  roomsDuty: () => call<RoomsDuty>('GET', '/rooms/duty'),
  roomBoost: (roomId: string, temperature: number, durationMin: number) =>
    cmd('POST', `/rooms/${enc(roomId)}/boost`, { temperature, duration_min: durationMin }),

  radiatorMode: (id: string, mode: SettableMode) => cmd('POST', `/radiators/${enc(id)}/mode`, { mode }),
  radiatorSetpoint: (id: string, kind: SetpointKind, value: number) =>
    cmd('POST', `/radiators/${enc(id)}/setpoint`, { kind, value }),
  radiatorProgram: (id: string, week: WeekProgram, opts: { base?: Base; force?: boolean } = {}) =>
    cmd('PUT', `/radiators/${enc(id)}/program`, { ...week, ...programOpts(opts) }),
  radiatorFeatures: (
    id: string,
    patch: { window_detection?: boolean; presence_detection?: boolean; name?: string }
  ) => cmd('PATCH', `/radiators/${enc(id)}/features`, patch),
  radiatorLight: (id: string, on: boolean, intensity?: number) =>
    cmd('POST', `/radiators/${enc(id)}/light`, intensity === undefined ? { on } : { on, intensity }),
  identify: (id: string) => cmd('POST', `/radiators/${enc(id)}/identify`),

  houseOff: () => cmd('POST', '/house/off'),
  houseProgram: () => cmd('POST', '/house/program'),
  houseAway: (untilIso: string, temperature: number) => cmd('POST', '/house/away', { until: untilIso, temperature }),
  cancelOverride: (id: string) => cmd('DELETE', `/overrides/${enc(id)}`),

  history: (radiatorIds: string[], start: number, end: number, step: number) =>
    call<HistoryPoint[]>(
      'GET',
      `/history?radiators=${enc(radiatorIds.join(','))}&start=${start}&end=${end}&step=${step}`
    ),
  energy: (start: number, end: number, group: 'hour' | 'day' | 'month', radiatorIds?: string[]) =>
    call<EnergyBucket[]>(
      'GET',
      `/energy/radiators?start=${start}&end=${end}&group=${group}` +
        (radiatorIds?.length ? `&radiators=${enc(radiatorIds.join(','))}` : '')
    ),
  energyReport: (from: string, to: string, group: EnergyGroup, period?: { from: string; to: string }) =>
    call<EnergyReport>(
      'GET',
      `/energy?from=${enc(from)}&to=${enc(to)}&group=${group}` +
        (period ? `&period_from=${enc(period.from)}&period_to=${enc(period.to)}` : '')
    ),
  energyDay: (date: string, room?: string | null) =>
    call<EnergyDay>('GET', `/energy/day?date=${enc(date)}` + (room ? `&room=${enc(room)}` : '')),
  settings: () => call<SettingsView>('GET', '/settings'),
  putTariff: (tariff: TariffInput) => call<SettingsView>('PUT', '/settings', { tariff }),
  linkyStatus: () => call<LinkyStatus>('GET', '/settings/linky'),
  putLinky: (prm: string, token?: string) =>
    call<LinkyStatus>('PUT', '/settings/linky', token ? { prm, token } : { prm })
};
