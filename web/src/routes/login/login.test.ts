import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { api, ApiError } from '$lib/api/client';
import { applyLocale } from '$lib/i18n';
import Page from './+page.svelte';

const url = { current: new URL('http://kelvin.test/login?next=%2Fschedule') };
vi.mock('$app/state', () => ({
  page: {
    get url() {
      return url.current;
    }
  }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
// The real ApiError: the i18n module (loaded by the test setup) checks `instanceof` against it.
vi.mock('$lib/api/client', async (orig) => ({
  ApiError: (await orig<typeof import('$lib/api/client')>()).ApiError,
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn() }
}));

beforeEach(() => {
  vi.clearAllMocks();
  url.current = new URL('http://kelvin.test/login?next=%2Fschedule');
  vi.mocked(api.me).mockResolvedValue({ email: null, logged_in: false, setup: true, simulator: false });
});

async function fill(email: string, password: string) {
  await fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } });
  await fireEvent.input(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  await fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('Login', () => {
  it('logs in with the Cozytouch account and goes to next', async () => {
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    await fill(' demo@kelvin.local ', 'kelvin');
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin');
    await waitFor(() => expect(goto).toHaveBeenCalledWith('/schedule', { replaceState: true }));
  });

  it('shows the server message and stays', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.'));
    render(Page);
    await fill('demo@kelvin.local', 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe Cozytouch incorrect.');
    expect(goto).not.toHaveBeenCalled();
  });

  it('asks for both fields before calling Kelvin', async () => {
    render(Page);
    await fill('', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez l’email et le mot de passe Cozytouch.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('marks and focuses the missing field, linked to the error', async () => {
    render(Page);
    await fill('demo@kelvin.local', '');
    const pw = screen.getByLabelText('Mot de passe');
    await waitFor(() => expect(document.activeElement).toBe(pw));
    expect(pw).toHaveAttribute('aria-invalid', 'true');
    expect(pw).toHaveAccessibleDescription('Saisissez l’email et le mot de passe Cozytouch.');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('a refused login keeps focus in the form (the password, selected), never on <body>', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.'));
    render(Page);
    await fill('demo@kelvin.local', 'nope');
    await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Mot de passe')));
    expect(screen.getByRole('button', { name: 'Se connecter' })).not.toBeDisabled();
  });

  it('a server failure is not blamed on the fields', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(503, 'Cozytouch ne répond pas.'));
    render(Page);
    await fill('demo@kelvin.local', 'kelvin');
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Mot de passe')).not.toHaveAttribute('aria-invalid');
  });

  it('never follows an outside next', async () => {
    url.current = new URL('http://kelvin.test/login?next=%2F%2Fevil.fr');
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    await fill('demo@kelvin.local', 'kelvin');
    await waitFor(() => expect(goto).toHaveBeenCalledWith('/', { replaceState: true }));
  });

  it('explains a password change and shows the simulator account', async () => {
    url.current = new URL('http://kelvin.test/login?next=%2F&reauth=1');
    vi.mocked(api.me).mockResolvedValue({ email: null, logged_in: false, simulator: true });
    render(Page);
    expect(screen.getByText('Reconnectez-vous avec le compte Cozytouch.')).toBeInTheDocument();
    expect(await screen.findByText('Simulateur : demo@kelvin.local · kelvin')).toBeInTheDocument();
  });

  it('leaves the form at once when a session already exists', async () => {
    vi.mocked(api.me).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith('/schedule', { replaceState: true }));
  });
});

describe('Login in English', () => {
  it('reads in English and shows a refused login by its code', async () => {
    applyLocale('en');
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'));
    render(Page);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Use the home’s Cozytouch account.')).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong Cozytouch email or password.');
  });
  it('empty fields are refused in English', async () => {
    applyLocale('en');
    render(Page);
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the Cozytouch email and password.');
  });
});
