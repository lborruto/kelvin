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
  api: { me: vi.fn(), login: vi.fn(), logout: vi.fn(), servers: vi.fn() }
}));

const LIST = {
  current: null as string | null,
  servers: [
    { id: 'sauter_cozytouch', name: 'Sauter Cozytouch', tier: 'cozytouch' as const, default: true },
    { id: 'atlantic_cozytouch', name: 'Atlantic Cozytouch', tier: 'cozytouch' as const, default: false },
    { id: 'thermor_cozytouch', name: 'Thermor Cozytouch', tier: 'cozytouch' as const, default: false },
    { id: 'flexom', name: 'Flexom', tier: 'experimental' as const, default: false }
  ]
};

let listReady = true;
beforeEach(() => {
  listReady = true;
  vi.clearAllMocks();
  url.current = new URL('http://kelvin.test/login?next=%2Fschedule');
  vi.mocked(api.me).mockResolvedValue({ email: null, logged_in: false, setup: true, simulator: false });
  vi.mocked(api.servers).mockResolvedValue(LIST);
});

/** « Changer » opens the server choice (Batch 11): the select is not there before. */
async function openPicker() {
  await fireEvent.click(await screen.findByRole('button', { name: 'Changer' }));
  return screen.getByRole('combobox', { name: 'Serveur' }) as HTMLSelectElement;
}

async function fill(email: string, password: string) {
  if (listReady) await waitFor(() => expect(screen.getByRole('button', { name: 'Se connecter' })).toHaveAttribute('aria-disabled', 'false'));
  await fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } });
  await fireEvent.input(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  await fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('Login', () => {
  it('logs in with the Cozytouch account and goes to next', async () => {
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    await screen.findByText('Serveur : Sauter Cozytouch');
    await fill(' demo@kelvin.local ', 'kelvin');
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', 'sauter_cozytouch');
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

describe('Login server', () => {
  it('offers the Cozytouch servers first, Sauter chosen', async () => {
    render(Page);
    const select = await openPicker();
    expect(select.value).toBe('sauter_cozytouch');
    const groups = [...select.querySelectorAll('optgroup')].map((g) => [
      g.label,
      [...g.querySelectorAll('option')].map((o) => o.textContent)
    ]);
    expect(groups).toEqual([
      ['Cozytouch', ['Sauter Cozytouch', 'Atlantic Cozytouch', 'Thermor Cozytouch']],
      ['Expérimental — chauffage seulement', ['Flexom']]
    ]);
  });

  it('sends the chosen server on a first login', async () => {
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    await fireEvent.change(await openPicker(), { target: { value: 'atlantic_cozytouch' } });
    await fill('demo@kelvin.local', 'kelvin');
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', 'atlantic_cozytouch');
  });

  it('explains an experimental server', async () => {
    render(Page);
    await fireEvent.change(await openPicker(), { target: { value: 'flexom' } });
    expect(screen.getByText('Utilisez le compte Flexom de la maison.')).toBeInTheDocument();
    expect(screen.getByText('Serveur : Flexom')).toBeInTheDocument();
    expect(screen.getByText('Mot de passe oublié ? Changez-le dans l’application Flexom.')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/n’affiche que le chauffage/);
    expect(screen.getByRole('combobox', { name: 'Serveur' })).toHaveAccessibleDescription(/n’affiche que le chauffage/);
  });

  it('shows the home’s server, without a choice, once claimed', async () => {
    vi.mocked(api.servers).mockResolvedValue({ ...LIST, current: 'thermor_cozytouch' });
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    expect(await screen.findByText('Serveur : Thermor Cozytouch')).toBeInTheDocument();
    expect(screen.getByText('Pour changer de serveur, repartez d’une installation neuve (voir le README).')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Serveur' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Changer' })).toBeNull();
    expect(screen.queryByText(/Première connexion/)).toBeNull();
    await fill('demo@kelvin.local', 'kelvin');
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', undefined);
  });

  it('holds the first login until the server list has answered', async () => {
    let answer!: (l: typeof LIST) => void;
    listReady = false;
    vi.mocked(api.servers).mockReturnValue(new Promise((r) => (answer = r)));
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    await fill('demo@kelvin.local', 'kelvin');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toHaveAttribute('aria-disabled', 'true');
    expect(api.login).not.toHaveBeenCalled();
    answer(LIST);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Se connecter' })).toHaveAttribute('aria-disabled', 'false'));
    await fireEvent.change(await openPicker(), { target: { value: 'thermor_cozytouch' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', 'thermor_cozytouch');
  });

  it('sends nothing when the server list cannot be read, and offers a retry', async () => {
    listReady = false;
    vi.mocked(api.servers).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de lire la liste des serveurs.');
    await fill('demo@kelvin.local', 'kelvin');
    expect(api.login).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('button', { name: 'Changer' });
    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', 'sauter_cozytouch');
  });
});

describe('Login, Batch 11', () => {
  it('shows the mark and one server line, the choice closed behind « Changer »', async () => {
    const { container } = render(Page);
    expect(container.querySelector('.wordmark.lg svg')).toHaveAttribute('aria-hidden', 'true');
    // Before the list: a skeleton holds the line, no « Changer » yet.
    expect(container.querySelector('.server .skeleton')).not.toBeNull();
    const change = await screen.findByRole('button', { name: 'Changer' });
    expect(container.querySelector('.server .skeleton')).toBeNull();
    expect(screen.getByText('Serveur : Sauter Cozytouch')).toBeInTheDocument();
    expect(change).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).toBeNull();
    await fireEvent.click(change);
    expect(change).toHaveAttribute('aria-expanded', 'true');
    const select = screen.getByRole('combobox', { name: 'Serveur' });
    expect(change).toHaveAttribute('aria-controls', 'server-pick');
    expect(document.getElementById('server-pick')).toContainElement(select);
    await fireEvent.click(change);
    expect(change).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the chosen server when the choice is closed again', async () => {
    vi.mocked(api.login).mockResolvedValue({ email: 'demo@kelvin.local', logged_in: true });
    render(Page);
    await fireEvent.change(await openPicker(), { target: { value: 'atlantic_cozytouch' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    expect(screen.getByText('Serveur : Atlantic Cozytouch')).toBeInTheDocument();
    await fill('demo@kelvin.local', 'kelvin');
    expect(api.login).toHaveBeenCalledWith('demo@kelvin.local', 'kelvin', 'atlantic_cozytouch');
  });

  it('says a first login claims the home, only while no home is claimed', async () => {
    render(Page);
    expect(await screen.findByText('Première connexion : ce compte devient celui de la maison.')).toBeInTheDocument();
    expect(screen.getByText('Mot de passe oublié ? Changez-le dans l’application Cozytouch.')).toBeInTheDocument();
  });

  it('the reveal button shows the password without renaming the field, and never across a submit', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'));
    render(Page);
    const pw = screen.getByLabelText('Mot de passe') as HTMLInputElement;
    expect(pw).toHaveAttribute('type', 'password');
    expect(pw).toHaveAttribute('name', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    const reveal = screen.getByRole('button', { name: 'Afficher le mot de passe' });
    expect(reveal).toHaveAttribute('type', 'button');
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    expect(reveal).toHaveAttribute('aria-controls', pw.id);
    await fireEvent.click(reveal);
    expect(pw).toHaveAttribute('type', 'text');
    expect(pw).toHaveAttribute('name', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
    // A toggle keeps its name; the state is aria-pressed.
    expect(screen.getByRole('button', { name: 'Afficher le mot de passe' })).toHaveAttribute('aria-pressed', 'true');
    await fill('demo@kelvin.local', 'nope');
    expect(api.login).toHaveBeenCalled();
    expect(pw).toHaveAttribute('type', 'password');
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
  });

  it('the reveal button is not a submit: clicking it sends nothing', async () => {
    render(Page);
    await screen.findByRole('button', { name: 'Changer' });
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'demo@kelvin.local' } });
    await fireEvent.input(screen.getByLabelText('Mot de passe'), { target: { value: 'kelvin' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(api.login).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refused login does not say which field was wrong', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'));
    render(Page);
    await fill('demo@kelvin.local', 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe Cozytouch incorrect.');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a data folder of another server keeps its words', async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApiError(409, 'x', 'data_other_server', { server: 'Atlantic Cozytouch' })
    );
    render(Page);
    await fill('demo@kelvin.local', 'kelvin');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Ce dossier de données appartient à une maison reliée au serveur Atlantic Cozytouch/
    );
  });

  it('keyboard order: Changer, email, password, reveal, submit, language', async () => {
    const { container } = render(Page);
    await screen.findByRole('button', { name: 'Changer' });
    const order = [...container.querySelectorAll<HTMLElement>('button, input, select, [tabindex]')]
      .filter((el) => el.tabIndex >= 0 && !el.hasAttribute('hidden'))
      .map((el) => el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.textContent?.trim());
    expect(order.slice(0, 5)).toEqual(['Changer', 'email', 'password', 'Afficher le mot de passe', 'Se connecter']);
    expect(order[5]).toBe('Français');
  });
});

describe('Login in English', () => {
  it('reads in English and shows a refused login by its code', async () => {
    applyLocale('en');
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'));
    render(Page);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Use the home’s Cozytouch account.')).toBeInTheDocument();
    expect(await screen.findByText('Server: Sauter Cozytouch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('First sign-in: this account becomes the home’s account.')).toBeInTheDocument();
    expect(screen.getByText('Forgot your password? Change it in the Cozytouch app.')).toBeInTheDocument();
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

describe('the login language switch', () => {
  it('FR | EN switches the screen before login, and a backend error then reads in English', async () => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(401, 'Email ou mot de passe Cozytouch incorrect.', 'bad_credentials'));
    render(Page);
    const en = screen.getByRole('radio', { name: 'English' });
    expect(en).toHaveTextContent('EN');
    await fireEvent.click(en);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem('kelvin-locale')).toBe('en');
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.fr' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong Cozytouch email or password.');
  });
});
