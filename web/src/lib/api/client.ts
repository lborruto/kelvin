import type {
  CommandResult,
  CurveDay,
  EnergyBucket,
  EnergyGroup,
  EnergyReport,
  HistoryPoint,
  LinkyStatus,
  Me,
  SetpointKind,
  SettableMode,
  SettingsView,
  Snapshot,
  TariffInput,
  WeekProgram
} from './types';

export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
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
    throw new ApiError(0, 'Kelvin est injoignable.');
  }
  if (!res.ok) {
    let message = 'Erreur inattendue.';
    let code: string | null = null;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') message = data.detail;
      if (typeof data?.code === 'string') code = data.code;
    } catch {
      /* body was not JSON */
    }
    // 503 carries Kelvin's own French message (Cozytouch or MyElectricalData unreachable).
    if (res.status >= 500 && res.status !== 503) message = 'Le serveur Kelvin a rencontré une erreur.';
    if (res.status === 401 && code === 'login_required') onLoginRequired?.();
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const cmd = (method: string, path: string, body?: unknown) => call<CommandResult>(method, path, body);

export const api = {
  me: () => call<Me>('GET', '/auth/me'),
  login: (email: string, password: string) => call<Me>('POST', '/auth/login', { email, password }),
  logout: () => call<Me>('POST', '/auth/logout'),
  house: () => call<Snapshot>('GET', '/house'),

  roomMode: (roomId: string, mode: SettableMode) => cmd('POST', `/rooms/${enc(roomId)}/mode`, { mode }),
  roomSetpoint: (roomId: string, kind: SetpointKind, value: number) =>
    cmd('POST', `/rooms/${enc(roomId)}/setpoint`, { kind, value }),
  roomProgram: (roomId: string, week: WeekProgram) => cmd('PUT', `/rooms/${enc(roomId)}/program`, week),
  roomBoost: (roomId: string, temperature: number, durationMin: number) =>
    cmd('POST', `/rooms/${enc(roomId)}/boost`, { temperature, duration_min: durationMin }),

  radiatorMode: (id: string, mode: SettableMode) => cmd('POST', `/radiators/${enc(id)}/mode`, { mode }),
  radiatorSetpoint: (id: string, kind: SetpointKind, value: number) =>
    cmd('POST', `/radiators/${enc(id)}/setpoint`, { kind, value }),
  radiatorProgram: (id: string, week: WeekProgram) => cmd('PUT', `/radiators/${enc(id)}/program`, week),
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
  energyReport: (from: string, to: string, group: EnergyGroup) =>
    call<EnergyReport>('GET', `/energy?from=${enc(from)}&to=${enc(to)}&group=${group}`),
  linkyCurve: (date: string) => call<CurveDay>('GET', `/linky/curve?date=${enc(date)}`),
  settings: () => call<SettingsView>('GET', '/settings'),
  putTariff: (tariff: TariffInput) => call<SettingsView>('PUT', '/settings', { tariff }),
  linkyStatus: () => call<LinkyStatus>('GET', '/settings/linky'),
  putLinky: (prm: string, token?: string) =>
    call<LinkyStatus>('PUT', '/settings/linky', token ? { prm, token } : { prm })
};
