import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { house } from '$lib/stores/house.svelte';
import RadiatorPanel from './RadiatorPanel.svelte';

vi.mock('$lib/api/client', () => ({
  api: {
    radiatorFeatures: vi.fn().mockResolvedValue({ pending: null }),
    radiatorLight: vi.fn().mockResolvedValue({ pending: null }),
    identify: vi.fn().mockResolvedValue({ pending: null }),
    radiatorMode: vi.fn().mockResolvedValue({ pending: null }),
    radiatorSetpoint: vi.fn().mockResolvedValue({ pending: null })
  },
  ApiError: class extends Error {}
}));

// The default normaliser turns U+202F/U+00A0 into plain spaces; keep them so the French format is asserted exactly.
const exact = (t: string) => t.trim();

const radiator = {
  id: '9312063', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5,
  mode: 'program' as const, target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17,
  heating_level: 'eco', max_temperature: 28, window_open: false, occupied: false, window_detection: true,
  presence_detection: false, light: { on: false, intensity: 1 }, energy_wh: { total: 2400000, t1: 500000, t2: 1900000 },
  working_rate: 0, rssi: 100, program: {}
};

describe('RadiatorPanel', () => {
  it('shows facts and toggles features', async () => {
    render(RadiatorPanel, { radiator, showControls: false });
    expect(screen.getByText('HEKLA P · 1500 W')).toBeInTheDocument();
    expect(screen.getByText('2 400 kWh', { normalizer: exact })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('switch', { name: 'Détection de fenêtre ouverte' }));
    expect(api.radiatorFeatures).toHaveBeenCalledWith('9312063', { window_detection: false });
    await fireEvent.click(screen.getByRole('switch', { name: 'Veilleuse' }));
    expect(api.radiatorLight).toHaveBeenCalledWith('9312063', true);
    await fireEvent.click(screen.getByRole('button', { name: 'Faire clignoter' }));
    expect(api.identify).toHaveBeenCalledWith('9312063');
  });

  it('hides missing sub-devices instead of showing NaN', () => {
    render(RadiatorPanel, { radiator: { ...radiator, light: null, energy_wh: null, temperature: null }, showControls: false });
    expect(screen.queryByRole('switch', { name: 'Veilleuse' })).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renames on submit', async () => {
    render(RadiatorPanel, { radiator, showControls: false });
    await fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    const input = screen.getByRole('textbox', { name: 'Nom du radiateur' });
    await fireEvent.input(input, { target: { value: 'Fenêtre' } });
    await fireEvent.submit(input.closest('form')!);
    expect(api.radiatorFeatures).toHaveBeenCalledWith('9312063', { name: 'Fenêtre' });
  });

  it('titles an unnamed radiator by model and power', () => {
    render(RadiatorPanel, { radiator: { ...radiator, model: 'HEKLA V', power_w: 2000 }, showControls: false });
    expect(screen.getByRole('heading', { name: 'HEKLA V · 2000 W' })).toBeInTheDocument();
    expect(screen.getAllByText('HEKLA V · 2000 W')).toHaveLength(1);
  });

  it('titles a renamed radiator by its name, the facts below', () => {
    render(RadiatorPanel, { radiator: { ...radiator, name: 'Fenêtre' }, showControls: false });
    expect(screen.getByRole('heading', { name: 'Fenêtre' })).toBeInTheDocument();
    expect(screen.getByText('HEKLA P · 1500 W')).not.toHaveRole('heading');
  });

  it('Renommer is a 44 px icon button', () => {
    render(RadiatorPanel, { radiator, showControls: false });
    const b = screen.getByRole('button', { name: 'Renommer' });
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.textContent?.trim()).toBe('');
    expect(b).toHaveClass('icon');
  });

  it('a toggle shows its own command as pending until the radiator answers', async () => {
    const p = { id: 't1', label: 'Veilleuse', radiator_ids: ['9312063'], status: 'pending', error: null, created_at: 1, expected: {} };
    vi.mocked(api.radiatorLight).mockResolvedValueOnce({ pending: p } as never);
    render(RadiatorPanel, { radiator, showControls: false });
    const light = screen.getByRole('switch', { name: 'Veilleuse' });
    const window = screen.getByRole('switch', { name: 'Détection de fenêtre ouverte' });
    await fireEvent.click(light);
    await waitFor(() => expect(light).toHaveClass('pending'));
    expect(window).not.toHaveClass('pending');
    house.applyPending({ ...p, status: 'confirmed' } as never);
    await waitFor(() => expect(light).not.toHaveClass('pending'));
  });
});
