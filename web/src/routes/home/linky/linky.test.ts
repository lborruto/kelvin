import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { applyLocale } from '$lib/i18n';
import Page from './+page.svelte';

vi.mock('$lib/api/client', () => ({
  api: { linkyStatus: vi.fn(), putLinky: vi.fn() },
  ApiError: class extends Error {}
}));

const PRM = '12345678901234';
const OK = {
  configured: true, prm: PRM, token_set: true, simulator: true, state: 'ok', message: null,
  last_day: '2026-10-14', last_ok_at: Date.now() / 1000 - 300, retry_at: null, calls_today: 10, budget: 14, consent_expires: '2027-04-01'
};
const OFF = { ...OK, configured: false, prm: null, token_set: false, simulator: false, state: 'off', last_day: null, last_ok_at: null, calls_today: 0, consent_expires: null };
const logSpy = vi.spyOn(console, 'log');

beforeEach(() => vi.clearAllMocks());
afterEach(() => applyLocale('fr'));

describe('Maison › Linky', () => {
  it('the state line, the connection as facts, the PDL masked until « Afficher »', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValueOnce(OK as never);
    render(Page);
    expect(await screen.findByText(/^Relié · données jusqu’au 14\/10\s· synchro il y a 5\smin$/)).toBeInTheDocument();
    expect(screen.getByText('•••• •••• ••12 34')).toBeInTheDocument();
    // Never in the page before « Afficher », the closed form included.
    expect(document.body.innerHTML).not.toContain(PRM);
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^10 appels sur 14 aujourd’hui, détails$/ })).toBeInTheDocument();
    expect(screen.getByText('1er avril 2027')).toBeInTheDocument();
    expect(screen.getByText(/^Simulateur/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Afficher\s+le PDL$/ }));
    expect(screen.getByText(PRM)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Masquer\s+le PDL$/ }));
    expect(document.body.innerHTML).not.toContain(PRM);
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(PRM);
  });

  it('« Modifier la connexion » is closed when connected and holds the form', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValueOnce(OK as never);
    render(Page);
    const modify = await screen.findByRole('button', { name: 'Modifier la connexion' });
    expect(modify).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Enregistrer et tester' })).toBeNull();
    await fireEvent.click(modify);
    expect(screen.getByRole('button', { name: 'Enregistrer et tester' })).toBeInTheDocument();
  });

  it('not connected: no facts, the form open at once', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValueOnce(OFF as never);
    render(Page);
    expect(await screen.findByRole('button', { name: 'Enregistrer et tester' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier la connexion' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Connexion', { selector: 'h2' })).toBeNull();
  });

  it('a refused token is said in bad, in the panel', async () => {
    vi.mocked(api.linkyStatus).mockResolvedValueOnce({ ...OK, state: 'auth', message: 'x' } as never);
    render(Page);
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });

  it('a failed load says so with Réessayer', async () => {
    vi.mocked(api.linkyStatus).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(OK as never);
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('•••• •••• ••12 34')).toBeInTheDocument();
  });

  it('in English', async () => {
    applyLocale('en');
    vi.mocked(api.linkyStatus).mockResolvedValueOnce(OK as never);
    render(Page);
    expect(await screen.findByRole('button', { name: /^Show\s+the PDL$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^10 of 14 calls today, details$|calls today, details$/ })).toBeInTheDocument();
  });
});
