import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import ErrorPage from './+error.svelte';

const state = { status: 404, url: new URL('http://kelvin.test/x') };
vi.mock('$app/state', () => ({
  page: {
    get status() {
      return state.status;
    },
    get url() {
      return state.url;
    }
  }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  state.status = 404;
});

describe('+error', () => {
  it('the error page sends a legacy path to its English page, query and anchor kept', () => {
    state.url = new URL('http://kelvin.test/maison?x=1#tarif'); // legacy-path-test
    render(ErrorPage);
    expect(goto).toHaveBeenCalledWith('/home?x=1#tariff', { replaceState: true });
  });
  it('an unknown English path shows the 404 with the ways out', () => {
    state.url = new URL('http://kelvin.test/nowhere');
    render(ErrorPage);
    expect(goto).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Cette page n’existe pas' })).toBeInTheDocument();
    expect(screen.getByText('L’adresse est peut-être ancienne ou incomplète.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aller aux pièces' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Aller aux pièces' })).toHaveClass('btn-primary');
    expect(screen.getByRole('link', { name: 'Énergie' })).toHaveAttribute('href', '/energy');
    expect(screen.getByRole('link', { name: 'Maison' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('button', { name: 'Détails' })).toBeNull();
    expect(document.title).toBe('Cette page n’existe pas · Kelvin');
  });
  it('another status is a load error: the cause in words, Réessayer, and the details one disclosure away', async () => {
    state.status = 500;
    state.url = new URL('http://kelvin.test/energy');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(ErrorPage);
    expect(goto).not.toHaveBeenCalled();
    expect(screen.queryByText('Cette page n’existe pas')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Kelvin n’a pas pu afficher cette page' })).toBeInTheDocument();
    expect(screen.getByText('Kelvin a rencontré une erreur. Réessayez dans un instant.')).toBeInTheDocument();
    expect(document.title).toBe('Erreur · Kelvin');
    const details = screen.getByRole('button', { name: 'Détails' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    const region = document.getElementById(details.getAttribute('aria-controls')!)!;
    expect(region).toHaveAttribute('hidden', 'until-found');
    await fireEvent.click(details);
    expect(region).not.toHaveAttribute('hidden');
    expect(region).toHaveTextContent('500');
    expect(region).toHaveTextContent('/energy');
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

it('the 404 reads in English', async () => {
  const { applyLocale } = await import('$lib/i18n');
  applyLocale('en');
  state.url = new URL('http://kelvin.test/nowhere');
  render(ErrorPage);
  expect(screen.getByRole('heading', { level: 1, name: 'This page doesn’t exist' })).toBeInTheDocument();
  expect(document.title).toBe('This page doesn’t exist · Kelvin');
  expect(screen.getByRole('link', { name: 'Go to rooms' })).toHaveAttribute('href', '/');
  applyLocale('fr');
});
