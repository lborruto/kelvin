import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { Pending } from '$lib/api/types';
import { forEachLocale } from '$lib/i18n/testing';
import { house } from '$lib/stores/house.svelte';
import LightSlider from './LightSlider.svelte';

vi.mock('$lib/api/client', () => ({
  api: { radiatorLight: vi.fn() },
  ApiError: class extends Error {}
}));

const base = {
  id: 'r1', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5,
  mode: 'program' as const, target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17,
  heating_level: 'eco', max_temperature: 28, window_open: false, occupied: false, window_detection: true,
  presence_detection: false, light: { on: true, intensity: 20 }, energy_wh: null, working_rate: 0, rssi: 100,
  program: {}
};
const pending = (status: Pending['status'], extra: Partial<Pending> = {}): Pending => ({
  id: 'p1', label: 'Radiateur : veilleuse à 45 %', radiator_ids: ['r1'], status, error: null, created_at: 1,
  expected: status === 'pending' ? { r1: { light_intensity: 45 } } : {}, label_code: 'night_light_intensity',
  label_params: { name: 'Radiateur', intensity: 45 }, error_code: null, error_params: {}, reason_code: null, ...extra
});

beforeEach(() => {
  vi.useFakeTimers();
  house.reset();
  house.connection = 'open';
  house.loaded = true;
  vi.mocked(api.radiatorLight).mockResolvedValue({ pending: pending('pending') });
});
afterEach(() => vi.useRealTimers());

describe('LightSlider', () => {
  it('commits once, 600 ms after the last key, with the snapped value', async () => {
    render(LightSlider, { radiator: base });
    const slider = screen.getByRole('slider', { name: 'Intensité de la veilleuse' });
    await fireEvent.keyDown(slider, { key: 'PageUp' });
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await vi.advanceTimersByTimeAsync(599);
    expect(api.radiatorLight).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.radiatorLight).toHaveBeenCalledTimes(1);
    expect(api.radiatorLight).toHaveBeenCalledWith('r1', true, 55);
  });

  it('a drag commits on release only', async () => {
    render(LightSlider, { radiator: base });
    const slider = screen.getByRole('slider') as HTMLInputElement;
    slider.value = '43';
    await fireEvent.input(slider);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.radiatorLight).not.toHaveBeenCalled();
    await fireEvent.change(slider);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.radiatorLight).toHaveBeenCalledWith('r1', true, 45);
  });

  it('shows the value as a percentage, dashed while pending, and the failure in words', async () => {
    const { container } = render(LightSlider, { radiator: base });
    expect(screen.getByText('20 %')).toBeInTheDocument(); // the default normaliser reads the NBSP as a space
    house.applyPending(pending('pending'));
    await fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(container.querySelector('.edge.pending')).not.toBeNull());
    house.applyPending(pending('failed', { error: 'Le radiateur n’a pas confirmé la commande.', error_code: 'no_confirmation' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Le radiateur n’a pas confirmé la commande.'));
  });

  it('a drag while paused snaps the thumb back: nothing moves, nothing is sent', async () => {
    house.connection = 'reconnecting';
    render(LightSlider, { radiator: base });
    const slider = screen.getByRole('slider') as HTMLInputElement;
    slider.value = '80';
    await fireEvent.input(slider);
    await fireEvent.change(slider);
    await vi.advanceTimersByTimeAsync(1000);
    expect(slider.value).toBe('20');
    expect(screen.getByText('20 %')).toBeInTheDocument();
    expect(api.radiatorLight).not.toHaveBeenCalled();
  });

  it('is inert while Kelvin is reconnecting', async () => {
    house.connection = 'reconnecting';
    render(LightSlider, { radiator: base });
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.keyDown(slider, { key: 'PageUp' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.radiatorLight).not.toHaveBeenCalled();
  });
});

forEachLocale((l) => {
  it('label and caption', () => {
    render(LightSlider, { radiator: base });
    expect(screen.getByRole('slider', { name: l === 'fr' ? 'Intensité de la veilleuse' : 'Night-light brightness' })).toBeInTheDocument();
    expect(screen.getByText(l === 'fr' ? 'Intensité' : 'Brightness')).toBeInTheDocument();
  });
});
