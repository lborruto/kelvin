// Énergie's three CSV files as menu actions (direction-2 §2: the « Exporter » header menu, the phone « ⋯ » sheet and
// the bottom ghost button all list the same items). The files themselves are `$lib/csv` (the machine contract in
// web/README.md); this module only says which files the page on screen offers and when one must wait.
import type { EnergyDay, EnergyReport, Radiator, Room } from './api/types';
import { curveCsv, download, energyCsv, roomsCsv } from './csv';
import type { Span } from './energy';
import { fmtDay } from './format';
import { m } from './i18n';
import { roomEnergy } from './roomEnergy';

export interface ExportInput {
  chart: EnergyReport;
  main: EnergyReport;
  period: Span;
  /** The period's elapsed days (up to yesterday): what `by_radiator` counts, as « Où part l’énergie » shows it. */
  roomSpan: Span;
  /** The Courbe's day (its file is offered once it has points). */
  day: EnergyDay | null;
  today: string;
  /** The house (rooms and radiator names): the rooms file waits for it. */
  house: { loaded: boolean; rooms: Room[]; radiators: Record<string, Radiator> };
}

export interface ExportAction {
  key: 'period' | 'curve' | 'rooms';
  label: string;
  /** Why it cannot run yet (the menu keeps it focusable with this reason). */
  disabled: string | null;
  run: () => void;
}

/** The files the page offers, in menu order. Read inside a `$derived` (labels follow the language). */
export function exportActions(x: ExportInput): ExportAction[] {
  const out: ExportAction[] = [
    { key: 'period', label: m.exportPanel.period, disabled: null, run: () => download(energyCsv(x.chart, x.main, x.period, x.today)) }
  ];
  const day = x.day;
  if (day && day.points > 0) out.push({ key: 'curve', label: m.exportPanel.curve(fmtDay(day.date)), disabled: null, run: () => download(curveCsv(day)) });
  if (x.main.by_radiator.length) {
    out.push({
      key: 'rooms',
      label: m.exportPanel.rooms,
      // The file names rooms and radiators: it waits for the house (aria-disabled in the menu, never disabled).
      disabled: x.house.loaded ? null : m.energyUi.waitHouse,
      run: () => {
        if (!x.house.loaded) return;
        download(roomsCsv(roomEnergy(x.main.by_radiator, x.house.rooms, x.house.radiators, x.roomSpan), x.roomSpan));
      }
    });
  }
  return out;
}
