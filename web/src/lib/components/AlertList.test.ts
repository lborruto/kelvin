import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { alerts } from '$lib/stores/alerts.svelte';
import AlertList from './AlertList.svelte';

vi.mock('$lib/api/client', () => ({ api: { alerts: vi.fn(), dismissAlert: vi.fn() }, ApiError: class extends Error {} }));

beforeEach(() => {
  alerts.reset();
  vi.mocked(api.alerts).mockReset();
});

describe('AlertList', () => {
  it('a failed load says so with a retry, never « Aucune alerte. »', async () => {
    vi.mocked(api.alerts).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([]);
    render(AlertList);
    expect(await screen.findByText('Impossible de charger les alertes.')).toBeInTheDocument();
    expect(screen.queryByText('Aucune alerte.')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune alerte.')).toBeInTheDocument();
  });
});
