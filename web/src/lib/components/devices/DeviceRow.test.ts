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
    expect(screen.getByText('Joignable')).toBeInTheDocument();
    expect(screen.getByText(/Dernier signal/)).toHaveTextContent('il y a 3');
    expect(screen.getByText('Détails')).toBeInTheDocument();
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
    expect(screen.getByText('Unreachable')).toBeInTheDocument();
  });
});
