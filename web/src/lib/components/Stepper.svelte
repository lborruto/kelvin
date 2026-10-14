<script lang="ts">
  import { untrack } from 'svelte';
  import { fmtTemp } from '$lib/format';
  import Icon from './Icon.svelte';

  interface Props {
    value: number | null;
    min: number;
    max: number;
    step?: number;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    debounceMs?: number;
    format?: (v: number | null) => string;
    /** May return the send's promise: a `null` result (rejected send) drops the unsent value at once. */
    onchange: (v: number) => unknown;
  }
  let {
    value, min, max, step = 0.5, label, pending = false, disabled = false,
    debounceMs = 600, format = (v) => fmtTemp(v), onchange
  }: Props = $props();

  const FALLBACK_MS = 10_000;
  /** How long the underline takes to morph from dashed to solid once the radiator confirms. */
  const SETTLE_MS = 250;
  let lastSent = $state<number | null>(null);
  let settling = $state(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settling = false), SETTLE_MS);
  };
  // Confirmed only when the radiator now reports the value that was sent; a failure stays plain.
  let confirmed = $derived(settling && lastSent !== null && value === lastSent);
  $effect(() => {
    if (confirmed) untrack(settle);
  });
  let local = $state<number | null>(null);
  let committed = false;
  let shown = $derived(local ?? value);
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatTimer: ReturnType<typeof setInterval> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  function release() {
    clearTimeout(fallbackTimer);
    committed = false;
    local = null;
  }

  // Once a commit was sent, any change of the server value ends the optimistic display.
  let prevValue: number | null | undefined;
  $effect(() => {
    const v = value;
    if (prevValue !== undefined && v !== prevValue && committed) release();
    prevValue = v;
  });

  // pending true -> false: the radiator answered (or the command failed); show the truth.
  let prevPending = false;
  $effect(() => {
    const p = pending;
    if (prevPending && !p) {
      settling = true;
      settle();
    }
    if (prevPending && !p && committed) release();
    prevPending = p;
  });

  $effect(() => () => {
    clearTimeout(commitTimer);
    clearTimeout(fallbackTimer);
    clearTimeout(settleTimer);
    stopHold();
  });

  function clamp(v: number) {
    return Math.min(max, Math.max(min, Math.round(v / step) * step));
  }

  function bump(dir: 1 | -1) {
    // No known value (e.g. radiators disagree and nothing aggregated it): nothing to step from.
    const base = local ?? value;
    if (base === null) {
      stopHold();
      return;
    }
    const next = clamp(base + dir * step);
    if (next === local) {
      stopHold();
      return;
    }
    local = next;
    committed = false;
    clearTimeout(fallbackTimer);
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, debounceMs);
  }

  function commit() {
    if (local !== null && local !== value) {
      committed = true;
      lastSent = local;
      fallbackTimer = setTimeout(release, FALLBACK_MS);
      const sent = local;
      const r = onchange(sent);
      if (r instanceof Promise) {
        r.then(
          (res) => {
            if (res === null && committed && local === sent) release();
          },
          () => {
            if (committed && local === sent) release();
          }
        );
      }
    } else release();
  }

  function startHold(e: PointerEvent, dir: 1 | -1) {
    if (e.button !== 0) return;
    stopHold();
    bump(dir);
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => bump(dir), 120);
    }, 400);
  }

  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
  }

  function key(e: KeyboardEvent, dir: 1 | -1) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      bump(dir);
    }
  }
</script>

<div class="stepper" class:pending role="group" aria-label={label}>
  <button type="button" aria-label="Diminuer {label}" disabled={disabled || shown === null || shown <= min}
    onpointerdown={(e) => startHold(e, -1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, -1)}><Icon name="minus" /></button>
  <output class="num" aria-live="polite"><span class="val">{format(shown)}<svg class="ul" aria-hidden="true"><line
        x1="0" x2="100%" y1="1" y2="1" class:confirmed /></svg></span></output>
  <button type="button" aria-label="Augmenter {label}" disabled={disabled || shown === null || shown >= max}
    onpointerdown={(e) => startHold(e, 1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, 1)}><Icon name="plus" /></button>
</div>

<style>
  .stepper {
    display: inline-grid;
    grid-template-columns: 44px minmax(5.5ch, auto) 44px;
    align-items: center;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  button {
    display: grid;
    place-items: center;
    height: 44px;
    border: 0;
    background: transparent;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
  }
  button:hover:not(:disabled) {
    background: var(--s2);
  }
  button:disabled {
    color: var(--fa);
    cursor: default;
  }
  output {
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    padding: 0 6px;
  }
  /* The underline belongs to the value, so it is as wide as the figure, not the control. */
  .val {
    position: relative;
    display: inline-block;
    padding-bottom: 2px;
  }
  /* Drawn underline: dashed while pending, morphing to solid on confirmation (same move as the strip). */
  .ul {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    overflow: visible;
  }
  .ul line {
    stroke: var(--line);
    stroke-width: 2;
  }
  .pending .ul line {
    stroke: var(--mu);
    stroke-dasharray: 4 3;
  }
  .ul line.confirmed {
    stroke: var(--mu);
    animation: solidify 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes solidify {
    from {
      stroke-dasharray: 4 3;
    }
    to {
      stroke-dasharray: 8 0;
    }
  }
</style>
