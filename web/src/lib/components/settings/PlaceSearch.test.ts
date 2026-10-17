import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '$lib/api/client';
import { applyLocale } from '$lib/i18n';
import PlaceSearch from './PlaceSearch.svelte';

const NB = ' ';
const LYON = { name: 'Lyon', admin1: 'Auvergne-Rhône-Alpes', admin2: 'Rhône', country_code: 'FR', lat: 45.76, lon: 4.84, elevation_m: 173 };
const GENEVE = { name: 'Genève', admin1: 'Genève', admin2: null, country_code: 'CH', lat: 46.2, lon: 6.15, elevation_m: 375 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const box = () => screen.getByRole('combobox');
async function type(text: string) {
  await fireEvent.input(box(), { target: { value: text } });
}

describe('PlaceSearch', () => {
  it('is an APG combobox: debounced, 2 characters, arrows and Enter pick', async () => {
    const search = vi.fn().mockResolvedValue({ results: [LYON, GENEVE] });
    const onpick = vi.fn();
    render(PlaceSearch, { onpick, lang: 'fr', search });
    expect(screen.getByRole('combobox', { name: 'Rechercher une commune' })).toBe(box());
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(box()).toHaveAttribute('aria-autocomplete', 'list');
    await type('l');
    await vi.advanceTimersByTimeAsync(400);
    expect(search).not.toHaveBeenCalled();
    await type('ly');
    await type('lyo');
    await vi.advanceTimersByTimeAsync(349);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await tick();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('lyo', 'fr');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent?.trim())).toEqual([`Lyon · Rhône · 173${NB}m`, `Genève · Genève (CH) · 375${NB}m`]);
    expect(box()).toHaveAttribute('aria-expanded', 'true');
    expect(box().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(screen.getByRole('status').textContent).toBe('2 lieux');
    await fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(box().getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(box().getAttribute('aria-activedescendant')).toBe(options[1].id); // wraps
    await fireEvent.keyDown(box(), { key: 'ArrowDown' });
    await fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onpick).toHaveBeenCalledWith(LYON);
    expect(box()).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape closes, a second Escape clears; a stale answer is dropped', async () => {
    let answer: (v: unknown) => void = () => {};
    const search = vi.fn().mockImplementationOnce(() => new Promise((r) => (answer = r))).mockResolvedValue({ results: [GENEVE] });
    render(PlaceSearch, { onpick: vi.fn(), lang: 'fr', search });
    await type('lyo');
    await vi.advanceTimersByTimeAsync(350);
    await type('gen');
    await vi.advanceTimersByTimeAsync(350);
    answer({ results: [LYON] }); // the first request answers last
    await tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([`Genève · Genève (CH) · 375${NB}m`]);
    await fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect((box() as HTMLInputElement).value).toBe('gen');
    await fireEvent.keyDown(box(), { key: 'Escape' });
    expect((box() as HTMLInputElement).value).toBe('');
  });

  it('a pointer press picks an option', async () => {
    const onpick = vi.fn();
    render(PlaceSearch, { onpick, lang: 'en', search: vi.fn().mockResolvedValue({ results: [GENEVE] }) });
    await type('gen');
    await vi.advanceTimersByTimeAsync(350);
    await fireEvent.pointerDown(screen.getByRole('option'));
    expect(onpick).toHaveBeenCalledWith(GENEVE);
  });

  it('no result says so', async () => {
    render(PlaceSearch, { onpick: vi.fn(), lang: 'fr', search: vi.fn().mockResolvedValue({ results: [] }) });
    await type('zzz');
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('status').textContent).toBe('Aucun lieu trouvé');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('says why when the search fails, under the field', async () => {
    const search = vi.fn().mockRejectedValue(new ApiError(429, '', 'weather_search_busy', {}));
    render(PlaceSearch, { onpick: vi.fn(), lang: 'fr', search });
    await type('lyon');
    await vi.advanceTimersByTimeAsync(350);
    const err = screen.getByText(/Trop de recherches/);
    expect(box().getAttribute('aria-describedby')).toContain(err.id);
    expect(err).toHaveAttribute('aria-live', 'polite');
  });

  it('reads in English', async () => {
    applyLocale('en');
    render(PlaceSearch, { onpick: vi.fn(), lang: 'en', search: vi.fn().mockResolvedValue({ results: [LYON, GENEVE, LYON] }) });
    expect(screen.getByRole('combobox', { name: 'Search for a town' })).toBeTruthy();
    await type('ly');
    await vi.advanceTimersByTimeAsync(350);
    expect(screen.getByRole('status').textContent).toBe('3 places');
  });
});
