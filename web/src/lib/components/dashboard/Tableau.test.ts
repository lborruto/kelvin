import { flushSync } from 'svelte';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import { alerts } from '$lib/stores/alerts.svelte';
import { grid } from '$lib/stores/grid.svelte';
import { house } from '$lib/stores/house.svelte';
import { toasts } from '$lib/stores/toasts.svelte';
import { dashboardEnergy } from '$lib/stores/dashboardEnergy.svelte';
import { weather } from '$lib/stores/weather.svelte';
import { VIEW } from '$lib/weather.fixture';
import { FORECAST, HIDDEN, forecastView } from '$lib/weatherModel.fixture';
import Tableau from './Tableau.svelte';

const NB = ' ';
const media = vi.hoisted(() => ({ desktop: { matches: false } }));
vi.mock('$lib/media.svelte', () => media);
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/today.svelte', () => ({ today: { iso: '2026-10-13' } }));
vi.mock('$lib/stores/history.svelte', () => ({ history: { data: {}, load: vi.fn() } }));
const report = {
  linky: true, tariff: true, last_day: '2026-10-12', from: '2026-09-01', to: '2026-11-01',
  period: { eur: 100.22, energy_eur: 80, subscription_eur: 20.22, kwh: 300.4 },
  total: { kwh: 38.2, eur: 10.22 },
  buckets: [{ key: '2026-09', eur: 118.4, kwh: 410 }, { key: '2026-10', eur: 100.22, kwh: 300.4 }],
  projection: { month: { key: '2026-10', kwh: 640, eur: 194.8 } }
};
const api = vi.hoisted(() => ({
  settings: vi.fn(),
  energyReport: vi.fn(),
  energyDay: vi.fn(),
  history: vi.fn(),
  alerts: vi.fn(),
  dismissAlert: vi.fn(),
  roomSetpoint: vi.fn(),
  roomMode: vi.fn(),
  roomBoost: vi.fn(),
  houseProgram: vi.fn(),
  houseOff: vi.fn(),
  cancelOverride: vi.fn(),
  weatherCostForecast: vi.fn()
}));
vi.mock('$lib/api/client', () => ({ api, ApiError: class extends Error {} }));

// Tuesday 13 October 2026, 13:48 in Paris: Éco until 17:30.
const NOW = Date.parse('2026-10-13T11:48:00Z');
const program = { tuesday: [{ start: '06:15', end: '08:00' }, { start: '17:30', end: '22:30' }] };
const caps = {
  modes: ['off', 'manual', 'program'], manual: [7, 28], comfort: [12, 28], eco: [1, 6], levels: [], program: true, dryer: [],
  window_detection: true, presence_detection: false, night_light: false, night_light_intensity: false, identify: true, energy: true,
  boost: true, rename: true, read_only: false
};
const rad = (id: string, room: string, extra: object = {}) => ({
  id, room_id: room, name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5, mode: 'program', target: 20, comfort: 20,
  eco_delta: 3, eco: 17, effective_setpoint: 17, heating_level: 'eco', max_temperature: 28, window_open: false, occupied: false,
  window_detection: true, presence_detection: false, light: null, energy_wh: null, working_rate: 0, rssi: 100, reachable: true,
  program, capabilities: caps, ...extra
});
const room = (id: string, name: string, ids: string[], extra: object = {}) => ({
  id, name, radiator_ids: ids, temperature: 19.5, mode: 'program', target: 20, comfort: 20, eco: 17, effective_setpoint: 17,
  heating_level: 'eco', window_open: false, occupied: false, ...extra
});
const load = (rooms: object[], radiators: object[], overrides: object[] = []) =>
  house.applySnapshot({ house: { rooms, radiators }, pending: [], overrides, status: { connected: true, last_ok_at: 1, last_error: null } } as never);
const standard = () =>
  load(
    [room('salon', 'Salon', ['a', 'b'], { temperature: 19.6 }), room('ch1', 'Chambre 1', ['c'], { temperature: 19.1 }), room('ch2', 'Chambre 2', ['d'])],
    [
      rad('a', 'salon', { name: 'Salon baie', temperature: 19.7, working_rate: 60 }),
      rad('b', 'salon', { name: 'Salon entrée', temperature: 19.5, working_rate: 20 }),
      rad('c', 'ch1', { temperature: 19.1 }),
      rad('d', 'ch2', { reachable: false, unreachable_since: Date.parse('2026-10-13T02:07:00Z') / 1000 })
    ]
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  applyLocale('fr');
  media.desktop.matches = false;
  for (const f of Object.values(api)) f.mockReset();
  api.settings.mockResolvedValue({ tariff: null, prefill: null });
  api.energyReport.mockResolvedValue(report);
  api.energyDay.mockResolvedValue({ intervals: [], totals: {} });
  api.history.mockResolvedValue([]);
  api.alerts.mockResolvedValue([]);
  api.roomSetpoint.mockResolvedValue({ pending: null });
  api.roomMode.mockResolvedValue({ pending: null });
  api.houseProgram.mockResolvedValue({ pending: null });
  api.cancelOverride.mockResolvedValue({ pending: null });
  api.weatherCostForecast.mockResolvedValue(FORECAST);
  dashboardEnergy.reset();
  alerts.reset();
  grid.reset();
  weather.reset();
  house.reset();
  house.connection = 'open';
});
afterEach(() => vi.useRealTimers());

/** Lets the energy answers land, then renders the frame they unlock. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

describe('Maison before the house is known', () => {
  it('the title and skeletons only: never a placeholder value', () => {
    const { container } = render(Tableau);
    expect(screen.getByRole('heading', { name: 'Maison', level: 1 })).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(4);
    expect(container.textContent).not.toMatch(/0,0|°/);
  });
});

describe('Maison on the phone', () => {
  it('chips, then two-column room tiles (offline last, calm), then Énergie and today’s programme', async () => {
    standard();
    const { container } = render(Tableau);
    await settle();
    const chips = screen.getByRole('group', { name: 'Résumés' });
    expect(chips).toHaveTextContent('Climat');
    expect(chips).toHaveTextContent('19,1–19,6°');
    expect(chips).toHaveTextContent(`Octobre100,22 €`);
    expect(chips).toHaveTextContent('RéseauRien à signaler');
    expect(chips).toHaveTextContent('AbsencePartir…');
    expect(screen.getByText('1 en chauffe · 1 hors ligne')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /^(Salon|Chambre)/ }).map((a) => a.getAttribute('aria-label'));
    expect(links).toEqual([
      expect.stringMatching(/^Salon, 19,6\s°C, Programme · Éco jusqu’à 17:30, consigne 17,0\s°C, En chauffe$/),
      expect.stringMatching(/^Chambre 1, 19,1\s°C, Programme · Éco jusqu’à 17:30/),
      'Chambre 2, Hors ligne depuis 04:07, Radiateur hors tension ou hors de portée'
    ]);
    const off = container.querySelector('.rt.offline')!;
    expect(off).toHaveTextContent('Hors ligne depuis 04:07');
    expect(off).not.toHaveTextContent('°');
    expect(off.querySelector('.bad')).toBeNull();
    expect(container.querySelector('.rt .lead.warm')).toHaveTextContent('En chauffe');
    expect(screen.getByRole('heading', { name: 'Énergie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Programme d’aujourd’hui' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Salon${NB}: confort 06:15–08:00, 17:30–22:30` })).toBeInTheDocument();
  });

  it('−/+ on a tile changes the level running now (Éco), sent as the lowering below comfort', async () => {
    vi.useRealTimers();
    standard();
    render(Tableau);
    await settle();
    const plus = screen.getByRole('button', { name: 'Augmenter Chambre 1 · Éco' });
    await fireEvent.pointerDown(plus);
    await fireEvent.pointerUp(plus);
    await new Promise((r) => setTimeout(r, 700));
    expect(api.roomSetpoint).toHaveBeenCalledWith('ch1', 'eco', 2.5);
  });

  it('a phone menu holds the house actions; the away icon opens the sheet', async () => {
    standard();
    render(Tableau);
    await settle();
    expect(screen.getAllByRole('button', { name: 'Plus d’actions pour la maison' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Partir…' }).length).toBeGreaterThan(0);
  });

  it('everything off: « Arrêt » with no −/+, the banner offers the way back', async () => {
    load(
      [room('salon', 'Salon', ['a'], { mode: 'off' }), room('ch2', 'Chambre 2', ['d'])],
      [rad('a', 'salon', { mode: 'off', working_rate: 50 }), rad('d', 'ch2', { reachable: false })]
    );
    render(Tableau);
    await settle();
    expect(screen.getByText('Tout est éteint')).toBeInTheDocument();
    expect(screen.getByText('Chambre 2 est hors ligne : elle ne l’a peut-être pas reçu.')).toBeInTheDocument();
    expect(screen.getByText('Ne chauffe pas')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Salon · / })).toBeNull();
    expect(document.querySelector('.lead.warm')).toBeNull();
    expect(screen.getByText('tout éteint · 1 hors ligne')).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Tout remettre en programme' }).at(-1)!);
    expect(api.houseProgram).toHaveBeenCalled();
  });

  it('an absence running: the chip and the widget say it in cool, tiles show no −/+, « Terminer » ends it', async () => {
    const away = { id: 'o', kind: 'away', room_id: null, radiator_ids: ['a', 'd'], temperature: 12, ends_at: Date.parse('2026-10-18T16:00:00Z') / 1000, restoring: false };
    load([room('salon', 'Salon', ['a']), room('ch2', 'Chambre 2', ['d'])], [rad('a', 'salon'), rad('d', 'ch2', { reachable: false })], [away]);
    const { container } = render(Tableau);
    await settle();
    expect(screen.getByRole('group', { name: 'Résumés' })).toHaveTextContent('Absencejusqu’à dim. 18:00');
    expect(container.querySelector('.rt.absence')).toHaveTextContent(`Absence · 12,0 °C`);
    expect(screen.queryByRole('group', { name: /^Salon · / })).toBeNull();
    expect(screen.getByText('toutes les pièces · Chambre 2 hors ligne')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Terminer l’absence' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o');
  });

  it('an open-ended absence: « Absence · 12,0 °C · jusqu’à votre retour » with « Terminer »', async () => {
    const away = { id: 'o', kind: 'away', room_id: null, radiator_ids: ['a', 'd'], temperature: 12, ends_at: null, open_ended: true, restoring: false };
    load([room('salon', 'Salon', ['a']), room('ch2', 'Chambre 2', ['d'])], [rad('a', 'salon'), rad('d', 'ch2', { reachable: false })], [away]);
    const { container } = render(Tableau);
    await settle();
    expect(screen.getByRole('group', { name: 'Résumés' })).toHaveTextContent('Absencejusqu’à votre retour');
    const line = [...container.querySelectorAll('.tx b')].find((b) => b.textContent!.includes(' · '));
    expect(line?.textContent).toMatch(/^Absence · 12,0\s°C · jusqu’à votre retour$/);
    expect(container.querySelector('.rt.absence')).toHaveTextContent(`Absence · 12,0 °C`);
    expect(screen.getByText('toutes les pièces · Chambre 2 hors ligne')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|1970|Invalid/);
    await fireEvent.click(screen.getByRole('button', { name: 'Terminer l’absence' }));
    expect(api.cancelOverride).toHaveBeenCalledWith('o');
  });

  it('alerts: a widget with its count, each row dismissable, « Masquer tout »; an offline radiator is never red', async () => {
    api.alerts.mockResolvedValue([
      { id: 1, kind: 'price_change', severity: 'warn', params: { date: '2027-02-01' }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false },
      { id: 2, kind: 'radiator_unreachable', severity: 'bad', params: { room_id: 'ch2', radiator_id: 'd', since: null }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false }
    ]);
    api.dismissAlert.mockResolvedValue(undefined);
    standard();
    alerts.applySummary({ active: 2, highest: 'bad' });
    const { container } = render(Tableau);
    await settle();
    expect(screen.getByRole('heading', { name: 'Alertes · 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Ajouter les prix/ })).toHaveAttribute('href', '/home/tariff');
    expect(container.querySelector('li.bad')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Masquer tout' }));
    expect(api.dismissAlert).toHaveBeenCalledTimes(2);
  });

  it('an alert the server raises or resolves after the first frame moves nothing until the owner asks (CLS)', async () => {
    const unreachable = { id: 2, kind: 'radiator_unreachable', severity: 'bad', params: { room_id: 'ch2', radiator_id: 'd', since: null }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };
    const price = { id: 1, kind: 'price_change', severity: 'warn', params: { date: '2027-02-01' }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };
    api.alerts.mockResolvedValue([unreachable]);
    standard();
    alerts.applySummary({ active: 1, highest: 'bad' });
    render(Tableau);
    await settle();
    expect(screen.getByRole('heading', { name: 'Alertes · 1' })).toBeInTheDocument();
    const before = toasts.items.length;
    // Raised: announced once, not drawn; « Mettre à jour » takes the place of « Masquer tout ».
    api.alerts.mockResolvedValue([unreachable, price]);
    alerts.applySummary({ active: 2, highest: 'bad' });
    await settle();
    expect(screen.getByRole('heading', { name: 'Alertes · 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Ajouter les prix/ })).toBeNull();
    expect(toasts.items.slice(before).map((t) => t.text())).toEqual(['1 nouvelle alerte']);
    expect(screen.queryByRole('button', { name: 'Masquer tout' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour les alertes' }));
    expect(screen.getByRole('heading', { name: 'Alertes · 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masquer tout' })).toBeInTheDocument();
    // Resolved: the row stays until the owner asks, and no toast for a row that leaves.
    api.alerts.mockResolvedValue([unreachable]);
    alerts.applySummary({ active: 1, highest: 'bad' });
    await settle();
    expect(screen.getByRole('heading', { name: 'Alertes · 2' })).toBeInTheDocument();
    expect(toasts.items.slice(before)).toHaveLength(1);
    // The toast's « Afficher » draws the server's list too.
    toasts.items[before].action!.run();
    flushSync();
    expect(screen.getByRole('heading', { name: 'Alertes · 1' })).toBeInTheDocument();
  });

  it('a dismissal redraws at once (the owner asked)', async () => {
    const price = { id: 1, kind: 'price_change', severity: 'warn', params: { date: '2027-02-01' }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };
    const ecowatt = { id: 3, kind: 'ecowatt', severity: 'warn', params: { date: '2026-10-14', level: 2, hours: [] }, first_seen: 0, last_seen: 0, resolved_at: null, dismissed: false };
    api.alerts.mockResolvedValue([price, ecowatt]);
    api.dismissAlert.mockResolvedValue(undefined);
    standard();
    alerts.applySummary({ active: 2, highest: 'warn' });
    render(Tableau);
    await settle();
    expect(screen.getByRole('heading', { name: 'Alertes · 2' })).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole('button', { name: /^Masquer/ }).find((b) => b.textContent === '')!);
    expect(screen.getByRole('heading', { name: 'Alertes · 1' })).toBeInTheDocument();
  });

  it('a running boost is listed with its rooms and « Arrêter »', async () => {
    const boost = { id: 'b1', kind: 'boost', room_id: 'salon', radiator_ids: ['a', 'b'], temperature: 22, ends_at: Date.parse('2026-10-13T18:42:00Z') / 1000, restoring: false };
    standard();
    house.applyOverrides([boost as never]);
    render(Tableau);
    await settle();
    expect(screen.getByText(/Salon · 22,0\s°C jusqu’à 20:42/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Arrêter la chauffe temporaire\s: Salon$/ }));
    expect(api.cancelOverride).toHaveBeenCalledWith('b1');
  });

  it('a window open: the tile never takes the heat colour nor says « En chauffe », even if a radiator still draws power', async () => {
    load([room('salon', 'Salon', ['a'], { window_open: true })], [rad('a', 'salon', { window_open: true, working_rate: 80 })]);
    const { container } = render(Tableau);
    await settle();
    expect(container.querySelector('.rt .ti.heat')).toBeNull();
    expect(container.querySelector('.rt .lead.bad')).toHaveTextContent('Fenêtre ouverte');
    expect(screen.getByRole('link', { name: /^Salon,/ }).getAttribute('aria-label')).not.toMatch(/En chauffe/);
  });

  it('Demain under Tempo: a colour not published yet says when it is expected', async () => {
    media.desktop.matches = true;
    standard();
    grid.apply({ tempo: { today: { date: '2026-10-13', colour: 'blue' }, tomorrow: { date: '2026-10-14', colour: null, expected_at: '11:00' }, fetched_at: 1 }, ecowatt: { days: [], fetched_at: null }, source: 'MED' });
    render(Tableau);
    await settle();
    expect(screen.getByRole('region', { name: 'Demain' })).toHaveTextContent('couleur pas encore publiée (vers 11:00)');
  });

  it('only the room links keep the tableau’s scroll and focus; other links land at the top of their page', async () => {
    media.desktop.matches = true;
    standard();
    const { container } = render(Tableau);
    await settle();
    expect(container.querySelector('.maison')).not.toHaveAttribute('data-sveltekit-noscroll');
    const tile = screen.getByRole('link', { name: /^Salon,/ });
    expect(tile.closest('[data-sveltekit-noscroll]')).not.toBeNull();
    expect(screen.getByRole('link', { name: /^Chauffe temporaire · Salon/ }).closest('[data-sveltekit-noscroll]')).not.toBeNull();
    for (const name of [/^Programme · Salon/, /^Programme$/, /^Énergie/]) {
      for (const a of screen.getAllByRole('link', { name })) expect(a.closest('[data-sveltekit-noscroll]')).toBeNull();
    }
  });

  it('Tempo is named only when the backend sends it (Tempo in force)', async () => {
    standard();
    grid.apply({ tempo: null, ecowatt: { days: [{ date: '2026-10-14', level: 2, hours: [{ start: '18:00', end: '20:00', level: 2 }] }], fetched_at: 1 }, source: 'MED' });
    const { container } = render(Tableau);
    await settle();
    expect(screen.getByRole('group', { name: 'Résumés' })).toHaveTextContent('EcoWatt orange demain');
    expect(container.textContent).not.toMatch(/Tempo/);
  });

  it('no Linky: no month chip and no bill', async () => {
    api.energyReport.mockResolvedValue({ ...report, linky: false });
    standard();
    render(Tableau);
    await settle();
    expect(screen.queryByText('Octobre')).toBeNull();
    expect(screen.queryByText(/jusqu’au/)).toBeNull();
  });
});

describe('Maison on desktop', () => {
  beforeEach(() => (media.desktop.matches = true));

  it('the header actions, one column per room that answers, the offline column, energy and today’s programme', async () => {
    standard();
    const { container } = render(Tableau);
    await settle();
    expect(screen.getAllByRole('button', { name: 'Tout éteindre' }).length).toBeGreaterThan(0);
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(['Salon', 'Chambre 1', 'Hors ligne · 1', 'Programme d’aujourd’hui', 'Énergie et réseau']);
    const salon = screen.getByRole('region', { name: 'Salon' });
    expect(within(salon).getByText('2 radiateurs')).toBeInTheDocument();
    expect(within(salon).getByRole('link', { name: /^Chauffe temporaire · Salon · Lancer…$/ })).toHaveAttribute('href', '/?sheet=salon&boost=1');
    expect(within(salon).getByRole('link', { name: /^Programme · Salon · → Confort 17:30$/ })).toHaveAttribute('href', '/schedule?room=salon');
    expect(within(salon).getByRole('link', { name: /^Radiateurs · Salon · 2 en chauffe · baie 19,7° · entrée 19,5°$/ })).toBeInTheDocument();
    // One radiator that reports windows: the Fenêtre tile instead.
    expect(within(screen.getByRole('region', { name: 'Chambre 1' })).getByRole('link', { name: /^Fenêtre · Chambre 1 · Fermée$/ })).toBeInTheDocument();
    expect(container.querySelector('.bill')).toHaveTextContent(`Octobre, jusqu’au 12`);
    expect(container.querySelector('.bill')).toHaveTextContent(`≈ 194,80 € fin du mois`);
    expect(container.querySelector('.bill')).toHaveTextContent(`septembre : 118,40 €`);
    expect(screen.getByRole('heading', { name: 'Maintenant' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Demain' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hier' })).toBeInTheDocument();
  });

  it('a month end from the weather says its method in the bill Fiche (Plan 15)', async () => {
    media.desktop.matches = true;
    api.energyReport.mockResolvedValue({ ...report, projection: { month: { ...report.projection.month, method: 'weather' } } });
    standard();
    const { container } = render(Tableau);
    await settle();
    const fig = container.querySelector<HTMLButtonElement>('.bill button.fig')!;
    await fireEvent.click(fig);
    flushSync();
    const fiche = document.querySelector('.fiche')!;
    expect(fiche).toHaveTextContent('Méthode');
    expect(fiche).toHaveTextContent('selon la météo');
  });

  it('a running boost: the tile in heat with its end; a window open shows on its tile', async () => {
    const boost = { id: 'b1', kind: 'boost', room_id: 'salon', radiator_ids: ['a', 'b'], temperature: 22, ends_at: Date.parse('2026-10-13T18:42:00Z') / 1000, restoring: false };
    load(
      [room('salon', 'Salon', ['a', 'b']), room('ch1', 'Chambre 1', ['c'], { window_open: true })],
      [rad('a', 'salon', { working_rate: 60 }), rad('b', 'salon'), rad('c', 'ch1', { window_open: true })],
      [boost]
    );
    render(Tableau);
    await settle();
    expect(screen.getByRole('link', { name: /^Chauffe temporaire · Salon · jusqu’à 20:42$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Fenêtre · Chambre 1 · Ouverte$/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Chambre 1 · / })).toBeNull();
  });

  it('everything off: no « Tout éteindre » in the header', async () => {
    load([room('salon', 'Salon', ['a'], { mode: 'off' })], [rad('a', 'salon', { mode: 'off' })]);
    const { container } = render(Tableau);
    await settle();
    expect(within(container.querySelector('.desk-actions') as HTMLElement).queryByRole('button', { name: 'Tout éteindre' })).toBeNull();
    expect(screen.getByText('La pièce ne chauffe pas.')).toBeInTheDocument();
  });

  it('in English', async () => {
    applyLocale('en');
    standard();
    render(Tableau);
    await settle();
    expect(screen.getByRole('heading', { name: 'Energy and grid' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today’s schedule' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Summary' })).toHaveTextContent('Climate');
    expect(screen.getByText('2 radiators')).toBeInTheDocument();
  });

  it('the house root reads « Maison » in French and “Home” in English, whatever the backend calls it', async () => {
    load([room('root', 'Ma maison', ['a'], { is_root: true })], [rad('a', 'root')]);
    render(Tableau);
    await settle();
    expect(screen.getAllByRole('heading', { name: 'Maison' }).length).toBe(2);
    applyLocale('en');
    flushSync();
    expect(screen.getAllByRole('heading', { name: 'Home' }).length).toBe(2);
  });
});

describe('a tile and its commands', () => {
  it('a pending request: the status line dashed, « Envoi… » above the link; a failure keeps Réessayer outside it', async () => {
    standard();
    house.applyPending({ id: 'p1', label: 'Chambre 1 : Manuel', radiator_ids: ['c'], status: 'pending', error: null, created_at: 2, expected: { c: { mode: 'manual', target: 21 } } });
    const { container } = render(Tableau);
    await settle();
    const tile = [...container.querySelectorAll('article.rt')].find((t) => t.textContent?.includes('Chambre 1'))!;
    expect(tile.querySelector('.s')).toHaveClass('pending');
    expect(tile).toHaveTextContent('Manuel');
    expect(within(tile as HTMLElement).getByText('Envoi…')).toBeInTheDocument();
    house.applyPending({ id: 'p1', label: 'Chambre 1 : Manuel', radiator_ids: ['c'], status: 'failed', error: 'x', created_at: 2, expected: { c: { mode: 'manual', target: 21 } } });
    flushSync();
    const retry = within(tile as HTMLElement).getByRole('button', { name: 'Réessayer' });
    expect(retry.closest('a')).toBeNull();
  });

  it('some radiators offline: the tile reads the ones that answer and says how many are offline', async () => {
    media.desktop.matches = true;
    load([room('salon', 'Salon', ['a', 'b'], { temperature: 18 })], [rad('a', 'salon', { temperature: 21 }), rad('b', 'salon', { temperature: 15, reachable: false })]);
    render(Tableau);
    await settle();
    expect(screen.getByRole('link', { name: /^Salon, 21,0\s°C, .*1 radiateur sur 2 hors ligne$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Radiateurs · Salon · .*1 radiateur sur 2 hors ligne$/ })).toBeInTheDocument();
  });
});

describe('Maison: the outdoor temperature (Plan 14)', () => {
  it('shows the Dehors chip last in the row (it may answer late: CLS), with its Fiche: model, publié, attribution link', async () => {
    media.desktop.matches = true;
    standard();
    weather.apply(VIEW);
    render(Tableau);
    await settle();
    const chips = screen.getAllByRole('group', { name: 'Résumés' })[0];
    const chip = within(chips).getByRole('button', { name: `Dehors 4,2${NB}°C, détails` });
    const pills = [...chips.querySelectorAll('.cat')];
    expect(pills.indexOf(chip)).toBe(pills.length - 1);
    expect(pills[0]).toHaveTextContent('Climat');
    await fireEvent.click(chip);
    const card = await screen.findByRole('dialog', { name: 'Température extérieure' });
    expect(within(card).getByText('Météo-France AROME HD via Open-Meteo')).toBeInTheDocument();
    expect(within(card).getByText('publié')).toBeInTheDocument();
    expect(within(card).getByText(/9,8.*prévu vers 15:00/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Open-Meteo/ })).toHaveAttribute('href', 'https://open-meteo.com/');
  });

  it('hides the chip without weather (no empty widget) and keeps four skeleton chips', async () => {
    const { container, unmount } = render(Tableau);
    expect(container.querySelectorAll('.sk-chips > *')).toHaveLength(4);
    unmount();
    weather.apply(VIEW);
    const sk = render(Tableau);
    expect(sk.container.querySelectorAll('.sk-chips > *')).toHaveLength(5);
    sk.unmount();
    weather.apply(null);
    standard();
    render(Tableau);
    await settle();
    expect(screen.queryByText('Dehors')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Dehors/ })).toBeNull();
  });

  it('says « — » with its reason before the first reading', async () => {
    media.desktop.matches = true;
    standard();
    weather.apply({ ...VIEW, now: null, fetch: { state: 'never', next: null, error_since: null } });
    render(Tableau);
    await settle();
    await fireEvent.click(screen.getAllByRole('button', { name: /^Dehors —, détails$/ })[0]);
    expect(await screen.findByText(/premier relevé en cours/)).toBeInTheDocument();
  });

  it('the chip goes when the place is removed (SSE weather: null), and reads in English', async () => {
    standard();
    weather.apply(VIEW);
    render(Tableau);
    await settle();
    expect(screen.getAllByRole('button', { name: /^Dehors/ }).length).toBeGreaterThan(0);
    weather.apply(null);
    flushSync();
    expect(screen.queryByRole('button', { name: /^Dehors/ })).toBeNull();
    weather.apply(VIEW);
    applyLocale('en');
    flushSync();
    expect(screen.getAllByRole('button', { name: `Outside 4.2${NB}°C, details` }).length).toBeGreaterThan(0);
  });
});

describe('Maison « Demain »: tomorrow’s heating cost (Plan 15)', () => {
  const tomorrow = () => screen.getByRole('region', { name: 'Demain' });
  it('the line, and its Fiche with the forecast kWh, range and €', async () => {
    media.desktop.matches = true;
    standard();
    weather.apply(VIEW);
    render(Tableau);
    await settle();
    const fig = within(tomorrow()).getByRole('button', { name: /de chauffage, détails$/ });
    expect(fig.textContent!.replace(/[\u00a0\u202f]/g, ' ')).toBe('2,0 °C → ~6,28 € de chauffage');
    await fireEvent.click(fig);
    const card = await screen.findByRole('dialog');
    for (const t of ['Consommation prévue', 'Fourchette', 'Coût prévu (énergie)', 'projection']) expect(within(card).getAllByText(t).length).toBeGreaterThan(0);
  });
  it('while the forecast loads, a skeleton line holds its place', async () => {
    api.weatherCostForecast.mockReturnValue(new Promise(() => {}));
    standard();
    weather.apply(VIEW);
    const { container } = render(Tableau);
    await settle();
    const line = within(tomorrow()).getByText((_, el) => !!el?.classList.contains('wline'));
    expect(line.querySelector('.skeleton')).not.toBeNull();
    expect(container.querySelector('.wline .fig')).toBeNull();
  });
  it('without a place: no line and no skeleton, no call', async () => {
    standard();
    const { container } = render(Tableau);
    await settle();
    expect(container.querySelector('.wline')).toBeNull();
    expect(api.weatherCostForecast).not.toHaveBeenCalled();
  });
  it('a hidden model: « — » and the reason in its Fiche', async () => {
    media.desktop.matches = true;
    api.weatherCostForecast.mockResolvedValue(forecastView({ ...HIDDEN, house: { ...HIDDEN.house, why: 'few_heating_days' } }));
    standard();
    weather.apply(VIEW);
    render(Tableau);
    await settle();
    const fig = within(tomorrow()).getByRole('button', { name: '—, détails' });
    await fireEvent.click(fig);
    expect(await screen.findByText('pas assez de jours de chauffage pour l’instant')).toBeInTheDocument();
  });
});
