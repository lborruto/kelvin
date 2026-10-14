import { untrack } from 'svelte';

/** How long the dash takes to close once the radiator confirms (DESIGN: the 250 ms morph). */
export const SETTLE_MS = 250;

/**
 * The confirming half of the signature, shared by the stepper, the mode switch, the toggle, the
 * card setpoint and the strip.
 *
 * While `requested()` returns a value, the mark is pending (dashed). When it returns null again
 * (the command answered or failed), that value is held for `holdMs`: if the radiator now reports
 * exactly it, `confirmed` turns true and the window restarts, so the dash always closes in full.
 * If it never does within the window, the hold ends without a morph: `held` is still set during
 * the window, so callers show the held value only while `confirmed`. Never a confirmation on a
 * timer.
 *
 * Create it during component initialisation (it owns effects).
 */
export class Settle<T> {
  /** The value that was pending, kept during the hold window; null otherwise. */
  held = $state<{ v: T } | null>(null);
  /** True while the held value matches what the radiator reports. */
  confirmed = $derived.by(() => this.held !== null && this.#reported() === this.held.v);
  #reported: () => T | null | undefined;
  #last: T | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #holdMs: number;

  constructor(requested: () => T | null | undefined, reported: () => T | null | undefined, holdMs = SETTLE_MS) {
    this.#reported = reported;
    this.#holdMs = holdMs;
    $effect(() => {
      const cur = requested() ?? null;
      untrack(() => {
        if (cur !== null) {
          clearTimeout(this.#timer);
          this.held = null;
        } else if (this.#last !== null) {
          this.held = { v: this.#last };
          this.#arm();
        }
        this.#last = cur;
      });
    });
    // Restart the window when the confirmation lands, so the morph plays in full.
    $effect(() => {
      if (this.confirmed) untrack(() => this.#arm());
    });
    $effect(() => () => clearTimeout(this.#timer));
  }

  #arm() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.held = null), this.#holdMs);
  }
}
