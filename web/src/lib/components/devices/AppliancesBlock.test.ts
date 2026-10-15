import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { SetupDevice } from '$lib/api/types';
import AppliancesBlock from './AppliancesBlock.svelte';

const device = (id: string, role: SetupDevice['role'], label: string): SetupDevice => ({
  id,
  role,
  label,
  widget: 'X',
  room_id: null,
  misplaced: false,
  reachable: true,
  last_event_at: null,
  details: {},
  support: 'readonly'
});

describe('AppliancesBlock', () => {
  it('lists every other device read-only', () => {
    render(AppliancesBlock, {
      devices: [device('bridge-2', 'water_heater', 'Chauffe-eau'), device('bridge-3', 'other', 'Volet')],
      now: 0
    });
    expect(screen.getByRole('heading', { name: 'Autres appareils' })).toBeInTheDocument();
    expect(screen.getByText(/Kelvin ne pilote pas ces appareils/)).toBeInTheDocument();
    expect(screen.getByText('Chauffe-eau', { selector: '.label' })).toBeInTheDocument();
    expect(screen.getAllByText('Lecture seule')).toHaveLength(2);
    expect(screen.queryAllByRole('button').filter((b) => !b.closest('summary'))).toHaveLength(0);
  });

  it('renders nothing without appliances', () => {
    const { container } = render(AppliancesBlock, { devices: [], now: 0 });
    expect(container.textContent?.trim()).toBe('');
  });
});
