import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyLocale } from '$lib/i18n';
import DayEditor from './DayEditor.svelte';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

const segs = [
  { start: 375, end: 480 },
  { start: 1050, end: 1350 }
];
const props = (over = {}) => ({
  day: 'monday' as const, segs, today: 'thursday' as const, nowMinute: 600,
  onchange: vi.fn(), onprev: vi.fn(), onnext: vi.fn(), oncopy: vi.fn(), ...over
});

describe('DayEditor', () => {
  it('heads with the day, today and edited, and steps to the previous and next day', async () => {
    const p = props({ day: 'thursday', edited: true, room: 'Chambre 1' });
    const { container } = render(DayEditor, p);
    expect(screen.getByRole('heading', { level: 2, name: 'Jeudi' })).toBeInTheDocument();
    // The line under the day: the room, today, « ● modifié ».
    expect([...container.querySelectorAll('.sub > span')].map((x) => x.textContent)).toEqual(['Chambre 1', 'aujourd’hui', 'modifié']);
    expect(container.querySelector('.sub .ed i')).not.toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Jour suivant' }));
    expect(p.onprev).toHaveBeenCalledOnce();
    expect(p.onnext).toHaveBeenCalledOnce();
  });

  it('lists only this day’s periods as editable times, with the comfort total', () => {
    render(DayEditor, props());
    expect(screen.getByLabelText('Lundi, plage 1, début')).toHaveValue('06:15');
    expect(screen.getByLabelText('Lundi, plage 2, fin')).toHaveValue('22:30');
    expect(screen.queryByLabelText(/Mardi/)).toBeNull();
    expect(screen.getByText('Plage 1')).toBeInTheDocument();
    expect(screen.getByText(/^Confort 6\sh\s45$/)).toBeInTheDocument();
    expect(screen.getByText(/éco le reste du temps/)).toBeInTheDocument();
    expect(screen.getByText('Plages Confort · 2 sur 3')).toBeInTheDocument();
    expect(document.querySelector('.actions + .note')).toHaveTextContent(/^3 plages au maximum · pas de 30\smin$/);
  });

  it('adds, edits and removes through the list', async () => {
    const p = props();
    render(DayEditor, p);
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    expect(p.onchange.mock.calls[0][0]).toHaveLength(3);
    await fireEvent.change(screen.getByLabelText('Lundi, plage 2, fin'), { target: { value: '23:15' } });
    // 23:15 is not a time the radiator keeps: the field takes the step's (23:30).
    expect(p.onchange.mock.calls[1][0][1]).toEqual({ start: 1050, end: 1410 });
    expect(screen.getByLabelText('Lundi, plage 2, fin')).toHaveAttribute('step', '1800');
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer la plage 1 du Lundi' }));
    expect(p.onchange.mock.calls[2][0]).toEqual([segs[1]]);
  });

  it('resets a time field whose value was rejected', async () => {
    render(DayEditor, props());
    const input = screen.getByLabelText('Lundi, plage 1, fin') as HTMLInputElement;
    await fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('08:00');
  });

  it('at three periods « Ajouter une plage » is paused with its reason; validation errors show', () => {
    render(DayEditor, props({ segs: [{ start: 0, end: 60 }, { start: 100, end: 200 }, { start: 150, end: 300 }] }));
    const add = screen.getByRole('button', { name: 'Ajouter une plage le Lundi' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('3 plages au maximum');
    expect(screen.getByRole('alert')).toHaveTextContent('Des plages se chevauchent.');
  });

  it('an empty day reads « Éco toute la journée »', () => {
    render(DayEditor, props({ segs: [] }));
    expect(screen.getByText('Éco toute la journée')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('while a send is pending the fields stay focusable but change nothing', async () => {
    const p = props({ pending: true });
    render(DayEditor, p);
    const input = screen.getByLabelText('Lundi, plage 1, début');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toBeDisabled();
    await fireEvent.change(input, { target: { value: '05:00' } });
    expect((input as HTMLInputElement).value).toBe('06:15');
    await fireEvent.click(screen.getByRole('button', { name: 'Supprimer la plage 1 du Lundi' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' }));
    expect(p.onchange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copier vers…' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('« Copier vers… » copies this day', async () => {
    const p = props();
    render(DayEditor, p);
    await fireEvent.click(screen.getByRole('button', { name: 'Copier vers…' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Week-end' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Copier sur 2 jours' }));
    expect(p.oncopy).toHaveBeenCalledWith(['saturday', 'sunday']);
  });

  it('a locked day: its periods as text and its reason, no fields, no add, no copy', () => {
    render(DayEditor, props({ day: 'sunday', segs: [{ start: 1200, end: 1440 }], locked: 'midnight' }));
    expect(screen.getByText('20:00–24:00')).toBeInTheDocument();
    expect(screen.getByText(/^Fin à minuit\s:\smodifiez ce jour dans l’app Cozytouch$/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/plage 1, début/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajouter une plage/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copier vers…' })).toBeNull();
    // What Kelvin does with it.
    expect(screen.getByText('Ce jour reste tel que le radiateur l’a.')).toBeInTheDocument();
    expect(screen.getByText(/Aucune copie n’arrive sur ce jour\./)).toBeInTheDocument();
  });

  it('on a phone: the day is the page title, slots are numbered, the scale is every 6 h, actions are list rows', async () => {
    const p = props({ compact: true, room: 'Salon' });
    const { container } = render(DayEditor, p);
    expect(screen.getByRole('heading', { level: 1, name: 'Lundi' })).toBeInTheDocument();
    expect(screen.queryByText('Plage 1')).toBeNull();
    expect(container.querySelectorAll('.hours span')).toHaveLength(5);
    expect(screen.getByText(/^Glissez une plage ou ses bords · pas de 30\smin$/)).toBeInTheDocument();
    expect(container.querySelector('.acts .row.add')).toHaveAccessibleName('Ajouter une plage le Lundi');
    expect(container.querySelector('.acts .row[aria-haspopup="dialog"]')).toHaveTextContent('Copier vers…');
    expect(screen.getByRole('button', { name: 'Jour précédent' })).toBeInTheDocument();
  });

  it('on a phone, full: the add row says why; a locked day says « verrouillé »', () => {
    const full = [{ start: 0, end: 60 }, { start: 100, end: 200 }, { start: 300, end: 400 }];
    const { unmount } = render(DayEditor, props({ compact: true, segs: full }));
    expect(screen.getByRole('button', { name: 'Ajouter une plage le Lundi' })).toHaveAccessibleDescription('3 plages au maximum');
    unmount();
    const { container } = render(DayEditor, props({ compact: true, day: 'saturday', segs: [], locked: 'unrecognised' }));
    expect(container.querySelector('.sub')).toHaveTextContent('verrouillé');
    expect(screen.queryByText(/Glissez/)).toBeNull();
  });

  it('in English', () => {
    applyLocale('en');
    render(DayEditor, props({ day: 'thursday', edited: true }));
    expect(screen.getByRole('heading', { name: 'Thursday' })).toBeInTheDocument();
    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.getByText('Comfort periods · 2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Thursday, period 1, start')).toHaveValue('06:15');
    expect(screen.getByRole('button', { name: 'Add a period on Thursday' })).toHaveTextContent('Add a period');
    expect(screen.getByRole('button', { name: 'Remove period 1 from Thursday' })).toBeInTheDocument();
    expect(screen.getByText(/^Comfort 6\sh 45\smin$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument();
  });
});
