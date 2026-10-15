/**
 * Today's date in Paris (ISO), as reactive state: it turns at Paris midnight while the page stays open, so a running
 * period, « jour en cours » and the days counted « jusqu’à hier » follow the calendar without a reload.
 *
 * A timer is armed for the next Paris midnight (DST days included); a page coming back into view checks again, since a
 * sleeping tab's timers run late.
 */
import { addDays } from '$lib/energy';
import { parisTodayIso } from '$lib/format';
import { parisDayStart } from '$lib/time';

export class Today {
  iso = $state('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.iso = parisTodayIso(now());
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
    this.arm();
  }

  /** Reads the clock again; the state changes only when the day did. */
  check(): void {
    const iso = parisTodayIso(this.now());
    if (iso !== this.iso) this.iso = iso;
    this.arm();
  }

  private arm(): void {
    clearTimeout(this.timer);
    // A few ms past midnight, so the clock reads the new day when the timer fires.
    const wait = Math.max(1000, parisDayStart(addDays(this.iso, 1)) - this.now() + 50);
    this.timer = setTimeout(() => this.check(), wait);
  }
}

export const today = new Today();
