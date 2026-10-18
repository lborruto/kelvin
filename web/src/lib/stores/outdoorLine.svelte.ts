// Énergie's « Température extérieure » line: shown by default, hidden per device (`kelvin-outdoor-line` in
// localStorage, like `kelvin-detail`). Read once at start, so the chart draws its final shape on the first frame.
export const OUTDOOR_LINE_KEY = 'kelvin-outdoor-line';

function read(): boolean {
  try {
    return localStorage.getItem(OUTDOOR_LINE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export class OutdoorLineStore {
  on = $state(read());

  set(value: boolean): void {
    this.on = value;
    try {
      if (value) localStorage.removeItem(OUTDOOR_LINE_KEY);
      else localStorage.setItem(OUTDOOR_LINE_KEY, 'off');
    } catch {
      /* private mode: the choice simply does not persist */
    }
  }

  toggle(): void {
    this.set(!this.on);
  }
}

export const outdoorLine = new OutdoorLineStore();
