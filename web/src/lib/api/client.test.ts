import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockImplementation(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends X-Kelvin and JSON on commands', async () => {
    const fn = mockFetch(202, { pending: { id: 'p1' } });
    const res = await api.roomSetpoint('p-salon', 'manual', 21.5);
    expect(res.pending?.id).toBe('p1');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('/api/rooms/p-salon/setpoint');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Kelvin']).toBe('1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ kind: 'manual', value: 21.5 });
  });

  it('encodes ids and query strings', async () => {
    const fn = mockFetch(200, []);
    await api.history(['9312063', '14172536'], 1000, 2000, 900);
    expect(fn.mock.calls[0][0]).toBe('/api/history?radiators=9312063%2C14172536&start=1000&end=2000&step=900');
    await api.roomMode('a/b', 'off');
    expect(fn.mock.calls[1][0]).toBe('/api/rooms/a%2Fb/mode');
  });

  it('surfaces the French detail of 4xx errors', async () => {
    mockFetch(422, { detail: 'La consigne se règle par pas de 0,5 °C.' });
    await expect(api.radiatorSetpoint('1', 'manual', 21.3)).rejects.toEqual(
      new ApiError(422, 'La consigne se règle par pas de 0,5 °C.')
    );
  });

  it('hides 5xx details behind the server code', async () => {
    mockFetch(500, { detail: 'Traceback…' });
    await expect(api.houseOff()).rejects.toMatchObject({ status: 500, code: 'server', message: '' });
  });

  it('maps network failure to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.house()).rejects.toMatchObject({ status: 0, code: 'network', message: '' });
  });

  it('keeps the params of a coded error, and calls a body with neither detail nor code unexpected', async () => {
    mockFetch(429, { detail: 'Trop de tentatives. Réessayez dans 15 min.', code: 'too_many_attempts', params: { minutes: 15 } });
    await expect(api.login('a@b.fr', 'x')).rejects.toMatchObject({ code: 'too_many_attempts', params: { minutes: 15 } });
    mockFetch(422, {});
    await expect(api.houseOff()).rejects.toMatchObject({ status: 422, code: 'unexpected', message: '' });
  });

  it('GET requests do not send the mutation header', async () => {
    const fn = mockFetch(200, { house: { rooms: [], radiators: [] } });
    await api.house();
    expect(fn.mock.calls[0][1].headers['X-Kelvin']).toBeUndefined();
  });

  it('keeps the error code and calls the login handler on 401 login_required only', async () => {
    const { setLoginRequiredHandler } = await import('./client');
    const handler = vi.fn();
    setLoginRequiredHandler(handler);
    mockFetch(401, { detail: 'Connexion requise.', code: 'login_required' });
    await expect(api.house()).rejects.toMatchObject({ status: 401, code: 'login_required' });
    expect(handler).toHaveBeenCalledTimes(1);
    mockFetch(401, { detail: 'Email ou mot de passe Cozytouch incorrect.', code: 'bad_credentials', params: {} });
    await expect(api.login('a@b.fr', 'x')).rejects.toMatchObject({
      status: 401,
      code: 'bad_credentials',
      message: 'Email ou mot de passe Cozytouch incorrect.'
    });
    expect(handler).toHaveBeenCalledTimes(1);
    setLoginRequiredHandler(null);
  });

  it('shows the server message of a 503', async () => {
    mockFetch(503, { detail: 'Cozytouch injoignable, réessayez dans un instant.' });
    await expect(api.login('a@b.fr', 'x')).rejects.toMatchObject({
      status: 503,
      message: 'Cozytouch injoignable, réessayez dans un instant.'
    });
  });

  it('logs in, out and asks who is there', async () => {
    const fn = mockFetch(200, { email: 'demo@kelvin.local', logged_in: true });
    await api.login('demo@kelvin.local', 'kelvin');
    expect(fn.mock.calls[0][0]).toBe('/api/auth/login');
    expect(fn.mock.calls[0][1].headers['X-Kelvin']).toBe('1');
    expect(JSON.parse(fn.mock.calls[0][1].body)).toEqual({ email: 'demo@kelvin.local', password: 'kelvin' });
    await api.me();
    expect(fn.mock.calls[1][0]).toBe('/api/auth/me');
    expect(fn.mock.calls[1][1].method).toBe('GET');
    await api.logout();
    expect(fn.mock.calls[2][0]).toBe('/api/auth/logout');
    expect(fn.mock.calls[2][1].method).toBe('POST');
  });
  it('reaches the energy and settings routes', async () => {
    const fn = mockFetch(200, {});
    await api.energyReport('2026-09-14', '2026-10-15', 'day');
    expect(fn.mock.calls[0][0]).toBe('/api/energy?from=2026-09-14&to=2026-10-15&group=day');
    await api.energyDay('2026-10-13');
    expect(fn.mock.calls[1][0]).toBe('/api/energy/day?date=2026-10-13');
    await api.putLinky('12345678901234');
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({ prm: '12345678901234' });
    await api.putLinky('12345678901234', 'tok-123456789');
    expect(JSON.parse(fn.mock.calls[3][1].body)).toEqual({ prm: '12345678901234', token: 'tok-123456789' });
    await api.putTariffDoc({
      kva: 12,
      prices: [{ valid_from: '2026-10-14', option: 'hchp', subscription_eur_month: 19.5, rates: { hc: 0.2, hp: 0.27 } }],
      hc_schedules: [{ valid_from: '2026-10-14', variants: [{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], slots: [{ start: '22:00', end: '06:00' }] }] }],
      tempo_hours: { hc_start: '22:00', hc_end: '06:00' }
    });
    expect(fn.mock.calls[4][0]).toBe('/api/settings');
    expect(fn.mock.calls[4][1].method).toBe('PUT');
    expect(JSON.parse(fn.mock.calls[4][1].body).tariff.kva).toBe(12);
  });
  it('asks for a selected period and for one day in detail', async () => {
    const fn = mockFetch(200, {});
    await api.energyReport('2026-10-01', '2026-11-01', 'day', { from: '2026-10-01', to: '2026-11-01' });
    expect(fn.mock.calls[0][0]).toBe(
      '/api/energy?from=2026-10-01&to=2026-11-01&group=day&period_from=2026-10-01&period_to=2026-11-01'
    );
    await api.energyDay('2026-10-13', 'p-salon');
    expect(fn.mock.calls[1][0]).toBe('/api/energy/day?date=2026-10-13&room=p-salon');
    await api.energyDay('2026-10-13');
    expect(fn.mock.calls[2][0]).toBe('/api/energy/day?date=2026-10-13');
  });

  it('sends the server at login and reads the server list', async () => {
    const f = mockFetch(200, { email: 'demo@kelvin.local', logged_in: true });
    await api.login('demo@kelvin.local', 'kelvin', 'atlantic_cozytouch');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      email: 'demo@kelvin.local', password: 'kelvin', server: 'atlantic_cozytouch'
    });
    const g = mockFetch(200, { servers: [], current: null });
    await api.servers();
    expect(g.mock.calls[0][0]).toBe('/api/auth/servers');
  });

  it('posts a level and a dryer action', async () => {
    const f = mockFetch(202, { pending: null });
    await api.radiatorLevel('r1', 'comfort-1');
    await api.radiatorDryer('r1', 'stop');
    expect(f.mock.calls.map((c) => [c[0], JSON.parse(c[1].body)])).toEqual([
      ['/api/radiators/r1/level', { level: 'comfort-1' }],
      ['/api/radiators/r1/dryer', { action: 'stop' }]
    ]);
  });
});
