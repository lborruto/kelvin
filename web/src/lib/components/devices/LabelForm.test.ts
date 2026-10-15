import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import LabelForm from './LabelForm.svelte';

describe('LabelForm', () => {
  it('checks as you type and sends the trimmed name', async () => {
    const onsubmit = vi.fn();
    render(LabelForm, { name: 'Nom de la pièce', kind: 'room', existing: ['Salon'], submitText: 'Créer', onsubmit });
    const input = screen.getByLabelText('Nom de la pièce');
    await fireEvent.input(input, { target: { value: 'salon' } });
    expect(screen.getByText('Une pièce porte déjà ce nom.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(onsubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    await fireEvent.input(input, { target: { value: '  Bureau ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(onsubmit).toHaveBeenCalledWith('Bureau');
  });

  it('LabelForm blocks a second submit while pending', async () => {
    const onsubmit = vi.fn();
    render(LabelForm, { name: 'Nom', kind: 'room', initial: 'Bureau', submitText: 'Créer', busy: true, onsubmit });
    const button = screen.getByRole('button', { name: 'Créer' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(button);
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('refuses a Cozytouch operation word as a radiator name', async () => {
    const onsubmit = vi.fn();
    render(LabelForm, { name: 'Nom du radiateur', kind: 'device', submitText: 'Enregistrer', onsubmit });
    await fireEvent.input(screen.getByLabelText('Nom du radiateur'), { target: { value: 'metadata' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Ce mot est réservé par Cozytouch.')).toBeInTheDocument();
    expect(onsubmit).not.toHaveBeenCalled();
  });

  it('Enter, click and Enter while the write is in flight send it once (review T11-1)', async () => {
    let settle!: () => void;
    const onsubmit = vi.fn(() => new Promise<void>((r) => (settle = r)));
    render(LabelForm, { name: 'Nom', kind: 'room', submitText: 'Créer', onsubmit });
    const input = screen.getByLabelText('Nom');
    await fireEvent.input(input, { target: { value: 'Bureau' } });
    const button = screen.getByRole('button', { name: 'Créer' });
    await fireEvent.submit(input.closest('form')!); // Enter
    await fireEvent.click(button);
    await fireEvent.submit(input.closest('form')!); // Enter again
    expect(onsubmit).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    settle();
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'false'));
  });
});
