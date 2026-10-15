import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import type { Capabilities } from '$lib/api/types';
import { auth } from '$lib/stores/auth.svelte';
import { house } from '$lib/stores/house.svelte';
import RadiatorPanel from './RadiatorPanel.svelte';
import { applyLocale } from '$lib/i18n';

// Commands are possible: the stream is up.
beforeEach(() => {
  house.connection = 'open';
});

vi.mock('$lib/api/client', () => ({
  api: {
    radiatorFeatures: vi.fn().mockResolvedValue({ pending: null }),
    radiatorLight: vi.fn().mockResolvedValue({ pending: null }),
    identify: vi.fn().mockResolvedValue({ pending: null }),
    radiatorMode: vi.fn().mockResolvedValue({ pending: null }),
    radiatorSetpoint: vi.fn().mockResolvedValue({ pending: null }),
    radiatorLevel: vi.fn().mockResolvedValue({ pending: null }),
    radiatorDryer: vi.fn().mockResolvedValue({ pending: null })
  },
  ApiError: class extends Error {}
}));

// The default normaliser turns U+202F/U+00A0 into plain spaces; keep them so the French format is asserted exactly.
const exact = (t: string) => t.trim();

const radiator = {
  id: '9312063', room_id: 'salon', name: 'Radiateur', model: 'HEKLA P', power_w: 1500, temperature: 19.5,
  mode: 'program' as const, target: 20, comfort: 20, eco_delta: 3, eco: 17, effective_setpoint: 17,
  heating_level: 'eco', max_temperature: 28, window_open: false, occupied: false, window_detection: true,
  presence_detection: false, light: { on: false, intensity: 1 }, energy_wh: { total: 2400000, t1: 500000, t2: 1900000 },
  working_rate: 0, rssi: 100, program: {}
};

describe('RadiatorPanel', () => {
  it('shows facts and toggles features', async () => {
    render(RadiatorPanel, { radiator, showControls: false, expanded: true });
    expect(screen.getByText('HEKLA P · 1500 W')).toBeInTheDocument();
    expect(screen.queryByText(/100\s%/)).toBeNull();
    expect(screen.getByText('RSSI 100')).toBeInTheDocument();
    expect(screen.getByText('Infos')).toBeInTheDocument();
    expect(screen.getByText('2 400 kWh', { normalizer: exact })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('switch', { name: 'Détection de fenêtre ouverte' }));
    expect(api.radiatorFeatures).toHaveBeenCalledWith('9312063', { window_detection: false });
    await fireEvent.click(screen.getByRole('switch', { name: 'Veilleuse' }));
    expect(api.radiatorLight).toHaveBeenCalledWith('9312063', true);
    await fireEvent.click(screen.getByRole('button', { name: 'Faire clignoter' }));
    expect(api.identify).toHaveBeenCalledWith('9312063');
  });

  it('hides missing sub-devices instead of showing NaN', () => {
    render(RadiatorPanel, { radiator: { ...radiator, light: null, energy_wh: null, temperature: null }, showControls: false, expanded: true });
    expect(screen.queryByRole('switch', { name: 'Veilleuse' })).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
    // The missing temperature, and Infos' own unknowns (this fixture predates reachability).
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('renames on submit', async () => {
    render(RadiatorPanel, { radiator, showControls: false, expanded: true });
    await fireEvent.click(screen.getByRole('button', { name: 'Renommer' }));
    const input = screen.getByRole('textbox', { name: 'Nom du radiateur' });
    await fireEvent.input(input, { target: { value: 'Fenêtre' } });
    await fireEvent.submit(input.closest('form')!);
    expect(api.radiatorFeatures).toHaveBeenCalledWith('9312063', { name: 'Fenêtre' });
  });

  const pilotCaps: Capabilities = {
    modes: [], manual: null, comfort: null, eco: null, levels: ['comfort', 'eco', 'frostprotection', 'off'], program: false, dryer: [],
    window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false, identify: false,
    energy: false, boost: false, rename: false, read_only: false
  };

  it('offers Renommer only when capabilities.rename says so', () => {
    render(RadiatorPanel, { radiator: { ...radiator, capabilities: pilotCaps }, showControls: false, expanded: true });
    expect(screen.queryByRole('button', { name: 'Renommer' })).toBeNull();
  });

  it('offers Renommer when capabilities.rename says so', () => {
    render(RadiatorPanel, { radiator: { ...radiator, capabilities: { ...pilotCaps, rename: true } }, showControls: false, expanded: true });
    expect(screen.getByRole('button', { name: 'Renommer' })).toBeInTheDocument();
  });

  it('hides Renommer on an experimental server (the name is a setup write)', () => {
    auth.server = { id: 'flexom', name: 'Flexom', tier: 'experimental', default: false };
    try {
      render(RadiatorPanel, { radiator: { ...radiator, capabilities: { ...pilotCaps, rename: true } }, showControls: false, expanded: true });
      expect(screen.queryByRole('button', { name: 'Renommer' })).toBeNull();
    } finally {
      auth.server = null;
    }
  });

  it('hides Renommer on a read-only device even if it names itself', () => {
    render(RadiatorPanel, { radiator: { ...radiator, support: 'readonly', capabilities: { ...pilotCaps, rename: true } }, showControls: false, expanded: true });
    expect(screen.queryByRole('button', { name: 'Renommer' })).toBeNull();
  });

  it('hides « Consigne active » when the device has no manual setpoint', () => {
    render(RadiatorPanel, { radiator: { ...radiator, capabilities: pilotCaps }, showControls: false, expanded: true });
    expect(screen.queryByText('Consigne active')).toBeNull();
  });

  it('shows « Consigne active » on a setpoint heater', () => {
    render(RadiatorPanel, { radiator, showControls: false, expanded: true });
    expect(screen.getByText('Consigne active')).toBeInTheDocument();
  });

  it('titles an unnamed radiator by model and power', () => {
    render(RadiatorPanel, { radiator: { ...radiator, model: 'HEKLA V', power_w: 2000 }, showControls: false, expanded: true });
    expect(screen.getByRole('heading', { name: /^HEKLA V · 2000\u00a0W/ })).toBeInTheDocument();
    expect(screen.getAllByText('HEKLA V · 2000 W')).toHaveLength(1);
  });

  it('titles a renamed radiator by its name, the facts below', () => {
    render(RadiatorPanel, { radiator: { ...radiator, name: 'Fenêtre' }, showControls: false, expanded: true });
    expect(screen.getByRole('heading', { name: /^Fenêtre/ })).toBeInTheDocument();
    expect(screen.getByText('HEKLA P · 1500 W')).not.toHaveRole('heading');
  });

  it('Renommer is a labelled ghost button with its pencil, in the open row', () => {
    render(RadiatorPanel, { radiator, showControls: false, expanded: true });
    const b = screen.getByRole('button', { name: 'Renommer' });
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b).toHaveTextContent('Renommer');
    expect(b).toHaveClass('btn-ghost');
  });

  it('is a disclosure row: name, power and reachability, reading in ink; the rest one tap away', async () => {
    const { container } = render(RadiatorPanel, { radiator: { ...radiator, reachable: true }, showControls: false });
    const row = screen.getByRole('button', { expanded: false });
    expect(row.closest('h4')).not.toBeNull();
    expect(row).toHaveTextContent(/Joignable/);
    expect(container.querySelector('.temp')!.getAttribute('style') ?? '').not.toMatch(/color/);
    expect(screen.queryByRole('button', { name: 'Faire clignoter' })).toBeNull();
    await fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(row.getAttribute('aria-controls')!)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Faire clignoter' })).toBeInTheDocument();
  });

  it('an offline radiator: « Hors ligne depuis … » muted, no reading', () => {
    const since = Date.now() / 1000 - 600;
    const { container } = render(RadiatorPanel, { radiator: { ...radiator, reachable: false, unreachable_since: since }, showControls: false });
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent(/Hors ligne depuis \d\d:\d\d/);
    expect(container.querySelector('.temp')).toHaveTextContent('—');
    expect(container.querySelector('.bad')).toBeNull();
  });

  it('a toggle shows its own command as pending until the radiator answers', async () => {
    const p = { id: 't1', label: 'Veilleuse', radiator_ids: ['9312063'], status: 'pending', error: null, created_at: 1, expected: {} };
    vi.mocked(api.radiatorLight).mockResolvedValueOnce({ pending: p } as never);
    render(RadiatorPanel, { radiator, showControls: false, expanded: true });
    const light = screen.getByRole('switch', { name: 'Veilleuse' });
    const window = screen.getByRole('switch', { name: 'Détection de fenêtre ouverte' });
    await fireEvent.click(light);
    await waitFor(() => expect(light).toHaveClass('pending'));
    expect(window).not.toHaveClass('pending');
    house.applyPending({ ...p, status: 'confirmed' } as never);
    await waitFor(() => expect(light).not.toHaveClass('pending'));
  });
});

it('in English: facts, toggles and actions', () => {
  applyLocale('en');
  render(RadiatorPanel, { radiator, showControls: false, expanded: true });
  expect(screen.getByText('Current setpoint')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Open-window detection' })).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Presence detection' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Blink' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
});

describe('night-light slider placement', () => {
  it('only while the light is on and reports its brightness', () => {
    const a = render(RadiatorPanel, { radiator: { ...radiator, light: { on: false, intensity: 1 } }, showControls: false, expanded: true });
    expect(screen.queryByRole('slider')).toBeNull();
    a.unmount();
    const b = render(RadiatorPanel, { radiator: { ...radiator, light: { on: true, intensity: null } }, showControls: false, expanded: true });
    expect(screen.queryByRole('slider')).toBeNull();
    b.unmount();
    render(RadiatorPanel, { radiator: { ...radiator, light: { on: true, intensity: 30 } }, showControls: false, expanded: true });
    expect(screen.getByRole('slider', { name: 'Intensité de la veilleuse' })).toBeInTheDocument();
  });
});

const NONE: Capabilities = {
  modes: [], manual: null, comfort: null, eco: null, levels: [], program: false, dryer: [],
  window_detection: false, presence_detection: false, night_light: false, night_light_intensity: false,
  identify: false, energy: false, boost: false, rename: false, read_only: true
};
const pilot = {
  ...radiator, id: 'p1', mode: 'manual' as const, heating_level: 'eco', light: null, kind: 'pilot_wire_heater' as const,
  support: 'expected' as const,
  capabilities: { ...NONE, levels: ['comfort', 'eco', 'frostprotection', 'off'] as const, read_only: false }
};
const dryer = {
  ...radiator, id: 'd1', mode: 'manual' as const, light: null, kind: 'towel_dryer' as const, support: 'expected' as const,
  dryer: 'boost' as const,
  capabilities: {
    ...NONE, modes: ['off', 'manual', 'program'] as const, manual: [7, 26] as [number, number],
    dryer: ['boost', 'drying'] as const, identify: true, boost: true, read_only: false
  }
};
const zone = {
  ...radiator, id: 'z1', mode: 'other' as const, kind: 'heater_unknown' as const, support: 'readonly' as const,
  capabilities: { ...NONE, energy: true }
};

describe('RadiatorPanel per kind', () => {
  it('a pilot-wire heater shows its levels and nothing it cannot do', async () => {
    render(RadiatorPanel, { radiator: pilot as never, showControls: true, expanded: true });
    const group = screen.getByRole('radiogroup', { name: 'Allure' });
    expect([...group.querySelectorAll('[role=radio]')].map((b) => b.textContent?.trim())).toEqual([
      'Confort', 'Éco', 'Hors-gel', 'Arrêt'
    ]);
    expect(screen.getByRole('radio', { name: 'Éco' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radiogroup', { name: /^Mode/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Détection de fenêtre ouverte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Faire clignoter' })).toBeNull();
    expect(screen.getByText('Devrait fonctionner')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('radio', { name: 'Hors-gel' }));
    expect(api.radiatorLevel).toHaveBeenCalledWith('p1', 'frostprotection');
  });

  it('a towel dryer shows its modes, its setpoint range and boost or drying', async () => {
    render(RadiatorPanel, { radiator: dryer as never, showControls: true, expanded: true });
    expect(screen.getByRole('radio', { name: 'Boost' })).toHaveAttribute('aria-checked', 'true');
    await fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
    expect(api.radiatorDryer).toHaveBeenCalledWith('d1', 'stop');
    await fireEvent.click(screen.getByRole('radio', { name: 'Séchage' }));
    expect(api.radiatorDryer).toHaveBeenCalledWith('d1', 'drying');
    expect(screen.getByRole('radio', { name: 'Programme' })).toBeInTheDocument(); // the compact « Prog. »
    expect(screen.queryByRole('switch', { name: 'Détection de présence' })).toBeNull();
  });

  it('a device Kelvin does not drive is shown read-only, never hidden', () => {
    render(RadiatorPanel, { radiator: zone as never, showControls: true, expanded: true });
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.getByText(/Kelvin ne pilote pas ce type d’appareil/)).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Faire clignoter' })).toBeNull();
    expect(screen.getByText('2 400 kWh', { normalizer: exact })).toBeInTheDocument();
  });
});
