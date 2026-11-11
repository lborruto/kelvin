import { untrack } from 'svelte';
import { SEND_IDLE_MS } from './send';

/** How long a sent value stays on screen with no answer from the radiator before the truth comes back. */
const FALLBACK_MS = 10_000;

export interface SendDraftOptions {
  /** The value the radiators report. */
  value: () => number | null;
  /** The command for the sent value is in progress. */
  pending?: () => boolean;
  /** The idle time after the last interaction before the one send; 0 sends every change at once. */
  debounceMs?: () => number;
  /** May return the send's promise: a `null` result or a rejection drops the sent value at once. */
  send: (v: number) => unknown;
}

// Every draft alive, so the shell can tell whether a value still waits to be sent (it never reloads over one).
const alive = new Set<SendDraft>();

/** True while some setpoint control holds a value that was shown but not sent yet. */
export function draftWaiting(): boolean {
  for (const d of alive) if (d.unsent) return true;
  return false;
}

/**
 * The unsent value of a setpoint control and its one timer (`$lib/send`): the value on screen, dashed until sent;
 * one send `debounceMs` after the last interaction; a waiting value is sent at once when its owner goes away or
 * the page is left. A Stepper or a VSlider owns one by default; the room sheet makes one and gives it to both
 * (`draft`), so −/+ and the slider continue from the same value and send it once.
 *
 * Create it during component initialisation (it owns effects).
 */
export class SendDraft {
  /** The value on screen while it differs from the radiators' (not sent yet, or sent and not reported yet). */
  local = $state<number | null>(null);
  /** `local` was sent: waiting for the radiator. */
  committed = $state(false);
  #value: () => number | null;
  #pending: () => boolean;
  #debounceMs: () => number;
  #send: (v: number) => unknown;
  #say: ((v: number) => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #fallback: ReturnType<typeof setTimeout> | undefined;
  #stops = new Set<() => void>();

  constructor(o: SendDraftOptions) {
    this.#value = o.value;
    this.#pending = o.pending ?? (() => false);
    this.#debounceMs = o.debounceMs ?? (() => SEND_IDLE_MS);
    this.#send = o.send;
    // Once a value was sent, any change of the radiators' value ends the optimistic display.
    let prevValue: number | null | undefined;
    $effect(() => {
      const v = this.#value();
      if (prevValue !== undefined && v !== prevValue && untrack(() => this.committed)) this.release();
      prevValue = v;
    });
    // pending true -> false: the radiator answered (or the command failed); show the truth.
    let prevPending = false;
    $effect(() => {
      const p = this.#pending();
      if (prevPending && !p && untrack(() => this.committed)) this.release();
      prevPending = p;
    });
    // Closing the sheet or leaving the page while a value waits sends it now rather than dropping it.
    $effect(() => {
      const flush = () => this.flush();
      alive.add(this);
      window.addEventListener('pagehide', flush);
      return () => {
        window.removeEventListener('pagehide', flush);
        this.flush();
        clearTimeout(this.#fallback);
        alive.delete(this);
      };
    });
  }

  /** The value on screen, sent or not. */
  get shown(): number | null {
    return this.local ?? this.#value();
  }

  /** A value shown but not sent yet: dashed like a pending one (« pas encore envoyé »). */
  get unsent(): boolean {
    return this.local !== null && !this.committed && this.local !== this.#value();
  }

  /** True while the idle wait runs. */
  get armed(): boolean {
    return this.#timer !== undefined;
  }

  /** Show `v` and stop the wait (the caller arms it once its press, drag or key is over). `say` announces the
   * value when it is sent: the control touched last decides. */
  set(v: number, say?: (v: number) => void) {
    this.hold();
    this.#say = say;
    // The value already sent (a drag cancelled after a flush): nothing new to send.
    if (v === this.local && this.committed) return;
    this.local = v;
    this.committed = false;
    clearTimeout(this.#fallback);
  }

  /** Nothing goes out while a press is held or a slider dragged. */
  hold() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** Restart the idle wait: the one send happens `debounceMs` after the last interaction. */
  arm() {
    this.hold();
    if (this.local === null || this.committed) return;
    const ms = this.#debounceMs();
    if (ms <= 0) {
      this.#commit();
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#commit();
    }, ms);
  }

  /** Send a waiting value now. */
  flush() {
    this.hold();
    for (const stop of this.#stops) stop();
    if (this.unsent) this.#commit();
  }

  /** A control's own timers (a held press) to stop before a flush; returns the way to unregister. */
  onflush(stop: () => void): () => void {
    this.#stops.add(stop);
    return () => this.#stops.delete(stop);
  }

  /** Back to the radiators' value. */
  release() {
    this.hold();
    clearTimeout(this.#fallback);
    this.committed = false;
    this.local = null;
  }

  #commit() {
    const sent = this.local;
    // One announcement per settled choice, not per tap, key or hold step.
    if (sent !== null) this.#say?.(sent);
    if (sent === null || sent === this.#value()) {
      this.release();
      return;
    }
    this.committed = true;
    clearTimeout(this.#fallback);
    this.#fallback = setTimeout(() => this.release(), FALLBACK_MS);
    const r = this.#send(sent);
    if (r instanceof Promise) {
      const drop = () => {
        if (this.committed && this.local === sent) this.release();
      };
      r.then((res) => {
        if (res === null) drop();
      }, drop);
    }
  }
}
