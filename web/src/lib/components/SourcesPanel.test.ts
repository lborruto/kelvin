import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import SourcesPanel from './SourcesPanel.svelte';

vi.mock('$lib/api/client', async (orig) => ({ ...(await orig<object>()), api: { status: vi.fn() } }));

const at = (h: number, m: number) => new Date(`2026-12-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`).getTime() / 1000;

describe('SourcesPanel', () => {
  it('says since when a source is unavailable, and the day’s MED calls', async () => {
    vi.mocked(api.status).mockResolvedValue({
      sources: {
        tempo: { state: 'error', last_ok: at(6, 30), error_since: at(8, 15), next: at(11, 15), enabled: true },
        ecowatt: { state: 'ok', last_ok: at(7, 15), error_since: null, next: at(17, 15), enabled: true },
        med: { calls_today: 6, grid_calls_today: 2, budget: 10 }
      }
    } as never);
    render(SourcesPanel);
    expect(await screen.findByText(/indisponible depuis 08:15/)).toBeTruthy();
    expect(screen.getByText(/à jour, relevé à 07:15/)).toBeTruthy();
    expect(screen.getByText(/Appels MyElectricalData aujourd’hui\s: 6 sur 10 \(dont 2 pour Tempo et EcoWatt\)/)).toBeTruthy();
  });

  it('hides Tempo when the tariff has no Tempo row', async () => {
    vi.mocked(api.status).mockResolvedValue({
      sources: {
        tempo: { state: 'off', last_ok: null, error_since: null, next: null, enabled: false },
        ecowatt: { state: 'never', last_ok: null, error_since: null, next: at(17, 15), enabled: true },
        med: { calls_today: 0, grid_calls_today: 0, budget: 10 }
      }
    } as never);
    render(SourcesPanel);
    expect(await screen.findByText(/pas encore interrogé/)).toBeTruthy();
    expect(screen.queryByText(/Tempo \(RTE\)/)).toBeNull();
  });
});
