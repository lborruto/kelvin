import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { applyLocale } from '$lib/i18n';
import { detail } from '$lib/stores/detail.svelte';
import { house } from '$lib/stores/house.svelte';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({ api: { linkyStatus: vi.fn(), status: vi.fn() }, ApiError: class extends Error {} }));

const at = (h: number, m: number) => new Date(`2026-12-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`).getTime() / 1000;
const GRID = {
  tempo: { state: 'error', last_ok: at(6, 30), error_since: at(8, 15), next: at(11, 15), enabled: true },
  ecowatt: { state: 'ok', last_ok: at(7, 15), error_since: null, next: at(17, 15), enabled: true },
  med: { calls_today: 6, grid_calls_today: 2, budget: 10 }
};
const LINKY = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok', message: null,
  last_day: '2026-11-30', last_ok_at: at(8, 0), retry_at: null, calls_today: 6, budget: 10, consent_expires: null
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.status).mockResolvedValue({ sources: GRID } as never);
  vi.mocked(api.linkyStatus).mockResolvedValue(LINKY as never);
  house.applySnapshot({ house: { rooms: [], radiators: [] }, pending: [], overrides: [], status: { connected: true, last_ok_at: Date.now() / 1000, last_error: null } });
  house.connection = 'open';
});
afterEach(() => {
  applyLocale('fr');
  detail.set(false);
});

describe('Maison › Sources de données', () => {
  it('one row per source, the late count in the state line, the day’s MED calls', async () => {
    render(Page);
    expect(await screen.findByRole('button', { name: /^Cozytouch/ })).toBeInTheDocument();
    for (const name of [/^Linky/, /^RTE EcoWatt/, /^Tempo/]) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByText('1 source en retard')).toBeInTheDocument();
    expect(screen.getByText('indisponible depuis 08:15')).toBeInTheDocument();
    expect(screen.getByText(/Appels MyElectricalData aujourd’hui\s: 6 sur 10 \(dont 2 pour Tempo et EcoWatt\)/)).toBeInTheDocument();
  });

  it('a row opens its exact times (closed: hidden until found)', async () => {
    render(Page);
    const tempo = await screen.findByRole('button', { name: /^Tempo/ });
    const region = document.getElementById(tempo.getAttribute('aria-controls')!)!;
    expect(region).toHaveAttribute('hidden', 'until-found');
    expect(region).toHaveTextContent('En erreur depuis');
    await fireEvent.click(tempo);
    expect(tempo).toHaveAttribute('aria-expanded', 'true');
    expect(region).not.toHaveAttribute('hidden');
  });

  it('« détails techniques » opens every row', async () => {
    detail.set(true);
    render(Page);
    const rows = await screen.findAllByRole('button', { expanded: true });
    expect(rows.length).toBe(4);
  });

  it('Tempo is absent without a Tempo price; a failed grid read says so', async () => {
    vi.mocked(api.status).mockResolvedValueOnce({ sources: { ...GRID, tempo: { ...GRID.tempo, state: 'off', enabled: false } } } as never);
    const a = render(Page);
    await screen.findByRole('button', { name: /^RTE EcoWatt/ });
    expect(screen.queryByRole('button', { name: /^Tempo/ })).toBeNull();
    a.unmount();
    vi.mocked(api.status).mockRejectedValueOnce(new Error('x'));
    render(Page);
    expect(await screen.findByText('État des sources indisponible.')).toBeInTheDocument();
  });

  it('in English', async () => {
    applyLocale('en');
    render(Page);
    expect(await screen.findByRole('heading', { level: 1, name: 'Data sources' })).toBeInTheDocument();
    expect(await screen.findByText('1 source late')).toBeInTheDocument();
  });
});
