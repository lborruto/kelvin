import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ProgramDay from './ProgramDay.svelte';

const segs = [
  { start: 375, end: 480 },
  { start: 1050, end: 1350 }
];

function stubRect(el: Element) {
  el.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, height: 32, right: 1440, bottom: 32, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

describe('ProgramDay', () => {
  it('lists slots as editable times', () => {
    render(ProgramDay, { label: 'Lundi', segs, onchange: vi.fn() });
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveValue('06:15');
    expect(screen.getByLabelText('Lundi, plage 2, fin')).toHaveValue('22:30');
  });

  it('adds, edits and removes through the list', async () => {
    const onchange = vi.fn();
    render(ProgramDay, { label: 'Lundi', segs, onchange });
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    expect(onchange.mock.calls[0][0]).toHaveLength(3);
    await fireEvent.change(screen.getByLabelText('Lundi, plage 2, fin'), { target: { value: '23:15' } });
    expect(onchange.mock.calls[1][0][1]).toEqual({ start: 1050, end: 1395 });
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer la plage 1 du Lundi' }));
    expect(onchange.mock.calls[2][0]).toEqual([segs[1]]);
  });

  it('clicking an empty part of the bar adds a slot there', async () => {
    const onchange = vi.fn();
    render(ProgramDay, { label: 'Lundi', segs, onchange });
    const bar = screen.getByTestId('bar-Lundi');
    stubRect(bar);
    await fireEvent.click(bar, { clientX: 600 });
    expect(onchange).toHaveBeenCalledWith([segs[0], { start: 600, end: 720 }, segs[1]]);
  });

  it('dragging a slot moves it', async () => {
    const onchange = vi.fn();
    render(ProgramDay, { label: 'Lundi', segs, onchange });
    stubRect(screen.getByTestId('bar-Lundi'));
    const block = screen.getByRole('button', { name: 'Lundi 06:15–08:00' });
    await fireEvent.pointerDown(block, { clientX: 400, pointerId: 1 });
    await fireEvent.pointerMove(block, { clientX: 460, pointerId: 1 });
    await fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onchange).toHaveBeenLastCalledWith([{ start: 435, end: 540 }, segs[1]]);
  });

  it('a click on the empty bar after a drag still adds a slot', async () => {
    const onchange = vi.fn();
    render(ProgramDay, { label: 'Lundi', segs, onchange });
    const bar = screen.getByTestId('bar-Lundi');
    stubRect(bar);
    const block = screen.getByRole('button', { name: 'Lundi 06:15–08:00' });
    await fireEvent.pointerDown(block, { clientX: 400, pointerId: 1 });
    await fireEvent.pointerMove(block, { clientX: 460, pointerId: 1 });
    await fireEvent.pointerUp(block, { pointerId: 1 });
    onchange.mockClear();
    await fireEvent.pointerDown(bar, { clientX: 600, pointerId: 1 });
    await fireEvent.click(bar, { clientX: 600 });
    expect(onchange).toHaveBeenCalledWith([segs[0], { start: 600, end: 720 }, segs[1]]);
  });

  it('is read-only while pending', async () => {
    const onchange = vi.fn();
    render(ProgramDay, { label: 'Lundi', segs, pending: true, onchange });
    const bar = screen.getByTestId('bar-Lundi');
    stubRect(bar);
    await fireEvent.click(bar, { clientX: 600 });
    expect(onchange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Lundi, plage 1, début')).toBeDisabled();
  });

  it('resets a time field whose value was rejected', async () => {
    render(ProgramDay, { label: 'Lundi', segs, onchange: vi.fn() });
    const input = screen.getByLabelText('Lundi, plage 1, fin') as HTMLInputElement;
    await fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('08:00');
  });

  it('disables adding at three slots and shows validation errors', () => {
    render(ProgramDay, {
      label: 'Lundi',
      segs: [{ start: 0, end: 60 }, { start: 100, end: 200 }, { start: 150, end: 300 }],
      onchange: vi.fn()
    });
    expect(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Des plages se chevauchent.');
  });
});
