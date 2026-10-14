<script lang="ts">
  import { fmtTemp } from '$lib/format';
  import { Settle } from '$lib/settle.svelte';
  import { announcer } from '$lib/stores/announcer.svelte';
  import Icon from './Icon.svelte';
  import PendingEdge from './PendingEdge.svelte';

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
    /** Announce each committed value; off where the command's own progress is announced. */
    announce?: boolean;
    /** May return the send's promise: a `null` result (rejected send) drops the unsent value at once. */
    onchange: (v: number) => unknown;
  }
  let {
    value, min, max, step = 0.5, label, pending = false, disabled = false,
    debounceMs = 600, format = (v) => fmtTemp(v), announce = true, onchange
  }: Props = $props();

  const FALLBACK_MS = 10_000;
  let local = $state<number | null>(null);
  let committed = false;
  let shown = $derived(local ?? value);
  // The value the radiator was asked for; confirmed when it reports exactly that (shared rule).
  const settle = new Settle(() => (pending ? (local ?? value) : null), () => value);
  // At a bound the button stays focusable (aria-disabled): a disabled button would drop focus to <body>.
  let atMin = $derived(disabled || shown === null || shown <= min);
  let atMax = $derived(disabled || shown === null || shown >= max);
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
    if (prevPending && !p && committed) release();
    prevPending = p;
  });

  $effect(() => () => {
    clearTimeout(commitTimer);
    clearTimeout(fallbackTimer);
    stopHold();
  });

  function clamp(v: number) {
    return Math.min(max, Math.max(min, Math.round(v / step) * step));
  }

  function bump(dir: 1 | -1) {
    if (disabled) {
      stopHold();
      return;
    }
    // No known value (e.g. radiators disagree and nothing aggregated it): nothing to step from.
    const base = local ?? value;
    if (base === null) {
      stopHold();
      return;
    }
    const next = clamp(base + dir * step);
    if (next === base || next === local) {
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
    // One announcement per settled choice, not per tap or hold step.
    if (announce && local !== null) announcer.say(`${label} : ${format(local)}`);
    if (local !== null && local !== value) {
      committed = true;
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
  <button type="button" aria-label="Diminuer {label}" aria-disabled={atMin}
    onpointerdown={(e) => startHold(e, -1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, -1)}><Icon name="minus" /></button>
  <output class="num"><span class="val">{format(shown)}<PendingEdge {pending} confirmed={settle.confirmed} /></span></output>
  <button type="button" aria-label="Augmenter {label}" aria-disabled={atMax}
    onpointerdown={(e) => startHold(e, 1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, 1)}><Icon name="plus" /></button>
</div>

<style>
  .stepper {
    display: inline-grid;
    grid-template-columns: 44px minmax(5.5ch, auto) 44px;
    align-items: center;
    flex: none;
    background: var(--in);
    border: 1px solid var(--field-line);
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
    transition: background-color var(--t-state) ease, color var(--t-state) ease;
  }
  @media (hover: hover) {
    button:hover:not([aria-disabled='true']) {
      background: var(--s2);
    }
  }
  button:active:not([aria-disabled='true']) {
    background: var(--s2);
  }
  button[aria-disabled='true'] {
    color: var(--fa);
    cursor: default;
  }
  output {
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    padding: 0 6px;
  }
  /* The underline belongs to the value, so it is as wide as the figure, not the control: a hairline
     at rest, dashed while pending, closing solid on confirmation (PendingEdge). */
  .val {
    position: relative;
    display: inline-block;
    padding-bottom: 2px;
    --edge-rest: var(--line);
  }
</style>
