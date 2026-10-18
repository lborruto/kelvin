import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WeatherCostPanel from './WeatherCostPanel.svelte';
import { HIDDEN, OFF, OK, THIN } from '$lib/weatherModel.fixture';

const nb = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');
const text = (c: HTMLElement) => nb(c.textContent);

describe('WeatherCostPanel', () => {
  it('shows the strip, three figures and the chart', () => {
    const { container } = render(WeatherCostPanel, { model: OK, periodName: 'octobre', tariff: true });
    expect(screen.getByRole('heading', { name: 'Météo et coût' })).toBeTruthy();
    expect(container.querySelector('#weather-cost')).not.toBeNull();
    expect(screen.getAllByRole('listitem', { name: /°C/ })).toHaveLength(7);
    expect(text(container)).toContain('≈ 9,6 kWh/jour');
    expect(text(container)).toContain('52 %');
    expect(text(container)).toContain('≈ 57,60 € sur 7 jours, dont 44,01 € de chauffage');
    expect(screen.getByRole('group', { name: 'Consommation selon la température extérieure' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '€' })).toBeTruthy();
    expect(screen.queryByText('estimation')).toBeNull();
  });
  it('the € chip switches the chart and says how the line is priced', async () => {
    sessionStorage.clear();
    const { container } = render(WeatherCostPanel, { model: OK, periodName: 'octobre', tariff: true });
    await fireEvent.click(screen.getByRole('radio', { name: '€' }));
    expect(text(container)).toContain('la ligne est aux prix d’aujourd’hui');
    expect(sessionStorage.getItem('kelvin.weatherCost.mode')).toBe('eur');
    sessionStorage.clear();
  });
  it('says « estimation » and why when thin', () => {
    render(WeatherCostPanel, { model: THIN, periodName: 'octobre', tariff: true });
    expect(screen.getByText('estimation')).toBeTruthy();
    expect(screen.getByText(/ajusté sur 41/)).toBeTruthy();
  });
  it('panel hides with its reason', () => {
    const { container } = render(WeatherCostPanel, { model: HIDDEN, periodName: 'octobre', tariff: true });
    expect(text(container)).toContain('12 sur 28');
    expect(text(container)).not.toContain('≈ 9,6 kWh/jour');
    expect(screen.getAllByRole('listitem', { name: /°C/ })).toHaveLength(7); // temperatures still shown
    expect(container.querySelectorAll('circle.dot')).toHaveLength(12); // the measured days still drawn
    expect(container.querySelector('path.model')).toBeNull();
  });
  it('weather off: the reason only', () => {
    const { container } = render(WeatherCostPanel, { model: OFF, periodName: 'octobre', tariff: true });
    expect(text(container)).toContain('aucun lieu météo choisi');
    expect(screen.queryAllByRole('listitem', { name: /°C/ })).toHaveLength(0);
  });
  it('no € toggle without a tariff', () => {
    render(WeatherCostPanel, { model: { ...OK, price: null }, periodName: 'octobre', tariff: false });
    expect(screen.queryByRole('radio', { name: '€' })).toBeNull();
  });
  it('skeleton at its final height while loading; a failure offers a retry', async () => {
    const { container, unmount } = render(WeatherCostPanel, { model: undefined, periodName: 'octobre', tariff: true });
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3);
    unmount();
    const onretry = vi.fn();
    render(WeatherCostPanel, { model: null, periodName: 'octobre', tariff: true, onretry });
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onretry).toHaveBeenCalled();
  });
  it('Comment c’est calculé lists the model and the attribution', () => {
    const { container } = render(WeatherCostPanel, { model: OK, periodName: 'octobre', tariff: true });
    expect(text(container)).toContain('301 jours retenus');
    expect(container.querySelector('a[href="https://open-meteo.com/"]')).not.toBeNull();
  });
});
