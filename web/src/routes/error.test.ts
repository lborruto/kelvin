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
  it('an unknown English path shows the 404 with a way back', () => {
    state.url = new URL('http://kelvin.test/nowhere');
    render(ErrorPage);
    expect(goto).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour aux pièces' })).toHaveAttribute('href', '/');
  });
  it('another status is not « introuvable »: a generic error with a retry', async () => {
    state.status = 500;
    state.url = new URL('http://kelvin.test/maison'); // legacy-path-test
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(ErrorPage);
    expect(goto).not.toHaveBeenCalled();
    expect(screen.queryByText('Page introuvable.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Une erreur est survenue.' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
