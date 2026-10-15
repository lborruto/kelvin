import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { auth } from '$lib/stores/auth.svelte';
import StrayNotice from './StrayNotice.svelte';
import { device } from './fixture';

vi.mock('$lib/api/client', () => ({
  api: { tidyDevice: vi.fn().mockResolvedValue({ pending: null }) },
  ApiError: class extends Error {}
}));

beforeEach(() => {
  auth.server = { id: 'sauter_cozytouch', name: 'Sauter Cozytouch', tier: 'cozytouch', default: true }; // canEditSetup(null) is false
});

describe('StrayNotice', () => {
  it('names the inconsistency and moves the device back with its radiator', async () => {
    render(StrayNotice, { device: device('r1#3', 'window', { misplaced: true, room_id: 'p-bureau' }) });
    expect(screen.getByText('Pas dans la même pièce que son radiateur')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Ranger avec le radiateur' }));
    expect(api.tidyDevice).toHaveBeenCalledWith('r1#3');
  });
});
