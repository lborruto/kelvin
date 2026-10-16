// « Afficher les détails techniques » (direction-2 §1.3): a per-device preference, off by default, stored
// like the theme (`kelvin-detail` in localStorage) and mirrored on <html data-detail="on"> by the
// app.html boot script before first paint, so a Disclosure marked `detail` starts open without a shift.
const KEY = 'kelvin-detail';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export class DetailStore {
  on = $state(read());

  set(value: boolean): void {
    this.on = value;
    try {
      if (value) localStorage.setItem(KEY, 'on');
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: the choice simply does not persist */
    }
    if (typeof document === 'undefined') return;
    if (value) document.documentElement.dataset.detail = 'on';
    else delete document.documentElement.dataset.detail;
  }
}

export const detail = new DetailStore();
