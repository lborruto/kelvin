import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { LinkyStatus } from '$lib/api/types';
import LinkyPanel from './LinkyPanel.svelte';

vi.mock('$lib/api/client', () => ({
  api: { putLinky: vi.fn() },
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
}));

const base: LinkyStatus = {
  configured: true, prm: '12345678901234', token_set: true, simulator: false, state: 'ok',
  message: null, last_day: '2026-10-12', last_ok_at: null, retry_at: null, calls_today: 3,
  budget: 10, consent_expires: '2029-10-14T08:54:06'
};

beforeEach(() => vi.clearAllMocks());

describe('LinkyPanel', () => {
  it('shows freshness, consent and the day’s calls', () => {
    render(LinkyPanel, { status: base, onsaved: vi.fn() });
    expect(screen.getByText('Relié · données jusqu’au 12/10')).toBeInTheDocument();
    expect(screen.getByText('Consentement Enedis valable jusqu’au 14 octobre 2029')).toBeInTheDocument();
    expect(screen.getByText('3 appels sur 10 aujourd’hui')).toBeInTheDocument();
  });

  it('shows the sync problem in words', () => {
    render(LinkyPanel, {
      status: { ...base, state: 'auth', message: 'MyElectricalData refuse le jeton : renouvelez-le dans Réglages.' },
      onsaved: vi.fn()
    });
    expect(screen.getByRole('alert')).toHaveTextContent('MyElectricalData refuse le jeton');
  });

  it('quota is a neutral line, not a problem', () => {
    render(LinkyPanel, {
      status: { ...base, state: 'quota', last_day: '2026-10-13', message: 'Quota Linky du jour atteint : reprise demain.' },
      onsaved: vi.fn()
    });
    expect(
      screen.getByText('Relié · données jusqu’au 13/10 · historique en cours de récupération, la suite arrive demain')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a space before « · synchro »', () => {
    render(LinkyPanel, { status: { ...base, last_ok_at: Date.now() / 1000 - 60 }, onsaved: vi.fn() });
    expect(document.querySelector('.state')!.textContent).toMatch(/12\/10\s·\ssynchro/);
  });

  it('never shows the token; a blank field keeps the stored one', async () => {
    vi.mocked(api.putLinky).mockResolvedValue(base);
    const onsaved = vi.fn();
    render(LinkyPanel, { status: base, onsaved });
    const token = screen.getByLabelText('Jeton MyElectricalData') as HTMLInputElement;
    expect(token.type).toBe('password');
    expect(token.value).toBe('');
    expect(token.placeholder).toBe('Enregistré');
    expect(document.getElementById(token.getAttribute('aria-describedby')!)).toHaveTextContent('Laissez vide pour garder le jeton.');
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }));
    expect(api.putLinky).toHaveBeenCalledWith('12345678901234', undefined);
    await fireEvent.input(token, { target: { value: 'tok-new-123456' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }));
    expect(api.putLinky).toHaveBeenLastCalledWith('12345678901234', 'tok-new-123456');
    await vi.waitFor(() => expect(token.value).toBe(''));
    expect(onsaved).toHaveBeenCalledWith(base);
  });

  it('checks the PDL and asks for a token the first time', async () => {
    render(LinkyPanel, { status: { ...base, configured: false, prm: null, token_set: false, state: 'off' }, onsaved: vi.fn() });
    expect(screen.getByText('Non relié.')).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('PDL (point de livraison)'), { target: { value: '123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Le PDL compte 14 chiffres.');
    await fireEvent.input(screen.getByLabelText('PDL (point de livraison)'), { target: { value: '12345678901234' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et tester' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Collez le jeton MyElectricalData.');
    expect(api.putLinky).not.toHaveBeenCalled();
  });

  it('uses new-password so browsers do not offer to save the token', () => {
    render(LinkyPanel, { status: base, onsaved: vi.fn() });
    expect(screen.getByLabelText('Jeton MyElectricalData')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('keeps « synchro il y a » ticking', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
      render(LinkyPanel, { status: { ...base, last_ok_at: Date.now() / 1000 - 60 }, onsaved: vi.fn() });
      expect(screen.getByText(/synchro il y a 1 min/)).toBeInTheDocument();
      vi.advanceTimersByTime(5 * 60_000);
      return vi.waitFor(() => expect(screen.getByText(/synchro il y a 6 min/)).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});
