import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '$lib/api/client';
import { AuthStore } from './auth.svelte';

vi.mock('$lib/api/client', () => ({
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn() },
  ApiError: class extends Error {
    status: number;
    code: string | null;
    constructor(status: number, message: string, code: string | null = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
}));

beforeEach(() => vi.clearAllMocks());

describe('AuthStore', () => {
  it('refresh reports the server answer, or null when Kelvin is unreachable', async () => {
    const s = new AuthStore();
    vi.mocked(api.me).mockResolvedValueOnce({ email: 'demo@kelvin.local', logged_in: true, simulator: true });
    expect(await s.refresh()).toBe(true);
    expect(s.email).toBe('demo@kelvin.local');
    expect(s.simulator).toBe(true);
    vi.mocked(api.me).mockResolvedValueOnce({ email: null, logged_in: false, reauth: true });
    expect(await s.refresh()).toBe(false);
    expect(s.reauth).toBe(true);
    vi.mocked(api.me).mockRejectedValueOnce(new ApiError(0, 'Kelvin est injoignable.'));
    expect(await s.refresh()).toBe(null);
  });

  it('login stores the email; logout forgets it', async () => {
    const s = new AuthStore();
    vi.mocked(api.login).mockResolvedValueOnce({ email: 'demo@kelvin.local', logged_in: true });
    await s.login('demo@kelvin.local', 'kelvin');
    expect(s.loggedIn).toBe(true);
    vi.mocked(api.logout).mockResolvedValueOnce({ email: null, logged_in: false });
    await s.logout();
    expect(s.loggedIn).toBe(false);
    expect(s.email).toBe(null);
  });

  it('logout keeps the session on a failure, but a 401 means it is already gone', async () => {
    const s = new AuthStore();
    s.email = 'a@b.c';
    s.loggedIn = true;
    vi.mocked(api.logout).mockRejectedValueOnce(new ApiError(0, 'Kelvin est injoignable.'));
    await expect(s.logout()).rejects.toBeInstanceOf(ApiError);
    expect(s.email).toBe('a@b.c');
    expect(s.loggedIn).toBe(true);
    vi.mocked(api.logout).mockRejectedValueOnce(new ApiError(401, 'Connexion requise.', 'login_required'));
    await s.logout();
    expect(s.email).toBeNull();
    expect(s.loggedIn).toBe(false);
  });

  it('keeps the home server from /auth/me', () => {
    const s = new AuthStore();
    const server = { id: 'thermor_cozytouch', name: 'Thermor Cozytouch', tier: 'cozytouch' as const, default: false };
    s.apply({ email: 'a@b.fr', logged_in: true, server });
    expect(s.server).toEqual(server);
    s.apply({ email: null, logged_in: false });
    expect(s.server).toBeNull();
  });
});
