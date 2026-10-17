import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocale } from '$lib/i18n';
import DeviceRow from './DeviceRow.svelte';
import { setupFixture } from './fixture';

const now = 1_760_000_180_000; // 3 min after the heater's last event
afterEach(() => applyLocale('fr'));

describe('DeviceRow', () => {
  it('shows role, Cozytouch label, widget, connectivity, last signal and details', () => {
    const heater = setupFixture().radiators[0].devices[0];
    render(DeviceRow, { device: heater, now });
    expect(screen.getByText('Chauffage')).toBeInTheDocument();
    expect(screen.getByText('Radiateur')).toBeInTheDocument();
    expect(screen.getByText(/AtlanticElectricalHeater/)).toHaveClass('mono');
    expect(screen.getByText('En ligne')).toBeInTheDocument();
    expect(screen.getByText(/Dernier signal/)).toHaveTextContent('il y a 3');
    expect(screen.getByText('Détails').closest('summary')).toHaveAccessibleName('Détails de Radiateur');
    expect(screen.getByText('core:VersionState')).toHaveClass('mono');
  });

  it('says « — » for what is unknown, never a guess', () => {
    const window = setupFixture().radiators[0].devices[2];
    render(DeviceRow, { device: window, now });
    expect(screen.getByLabelText('Connexion inconnue')).toHaveTextContent('—');
    expect(screen.getByText(/Dernier signal/)).toHaveTextContent('—');
    expect(screen.queryByText('Détails')).toBeNull();
  });

  it('speaks English', () => {
    applyLocale('en');
    const heater = setupFixture().radiators[0].devices[0];
    render(DeviceRow, { device: { ...heater, reachable: false }, now });
    expect(screen.getByText('Heater')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows a generic « IO (serial#n) » label as the role, never the serial', () => {
    const sensor = setupFixture().radiators[0].devices[1]; // label « IO (r1#2) »
    const { container } = render(DeviceRow, { device: { ...sensor, label: 'IO (9000011#2)' }, now });
    expect(container.textContent).not.toContain('9000011');
    expect(screen.getAllByText('Sonde de température')).toHaveLength(2); // role and label
  });

  it('the unknown connectivity chip is announced', () => {
    render(DeviceRow, { device: setupFixture().radiators[0].devices[2], now });
    expect(screen.getByRole('img', { name: 'Connexion inconnue' })).toHaveTextContent('—');
  });
});
