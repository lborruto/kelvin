import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ForecastStrip from './ForecastStrip.svelte';
import { desktop } from '$lib/media.svelte';
import { HIDDEN, OK, week } from '$lib/weatherModel.fixture';

const nb = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ');

// The phone's Fiche is a dialog jsdom cannot show modally.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
afterEach(() => {
  desktop.matches = false;
});

describe('ForecastStrip', () => {
  it('seven days named day, temperature, value; then the matched week', () => {
    const { container } = render(ForecastStrip, { forecast: OK.forecast });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(nb(items[0].getAttribute('aria-label'))).toBe('lun. 19, 2,0 °C, ~6,28 €');
    expect(nb(container.querySelector('.week')!.textContent)).toBe('≈ 57,60 € sur 7 jours, dont 44,01 € de chauffage');
  });
  it('an incomplete day reads « — » and its Fiche says why', async () => {
    desktop.matches = true; // the floating card (a phone opens a dialog jsdom lacks)
    const days = week().map((d, i) => (i === 6 ? { ...d, complete: false, t_c: null } : d));
    render(ForecastStrip, { forecast: { ...OK.forecast, days } });
    const last = screen.getAllByRole('listitem')[6];
    expect(nb(last.getAttribute('aria-label'))).toBe('dim. 25, —, —');
    last.querySelector('button')!.click();
    expect(await screen.findByText('prévision indisponible')).toBeTruthy();
  });
  it('without a model only temperatures show, and no week line', () => {
    const { container } = render(ForecastStrip, { forecast: HIDDEN.forecast });
    const items = screen.getAllByRole('listitem');
    expect(nb(items[0].getAttribute('aria-label'))).toBe('lun. 19, 2,0 °C, —');
    expect(container.querySelector('.week')).toBeNull();
  });
});
