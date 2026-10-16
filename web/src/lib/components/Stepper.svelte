<script lang="ts">
  import { fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
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
    /** A small muted word above the value (Tableau: « Confort », « Manuel »); visual only, `label` names it. */
    caption?: string;
    /** `md`: 36 px buttons (a 44 px pill); `sm`: 32 px (the phone room tile); `lg`: 56 px discs flanking a display
     * value (the room sheet). */
    size?: 'md' | 'sm' | 'lg';
    /** Stretch to the container's width (tiles, widgets). */
    block?: boolean;
  }
  let {
    value, min, max, step = 0.5, label, pending = false, disabled = false,
    debounceMs = 600, format = (v) => fmtTemp(v), announce = true, onchange, caption, size = 'md', block = false
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
    if (announce && local !== null) announcer.say(m.stepper.announce(label, format(local)));
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

<div class="stepper {size}" class:pending class:block class:inert={disabled} role="group" aria-label={label}>
  <button type="button" class="hit" aria-label={m.stepper.decrease(label)} aria-disabled={atMin}
    onpointerdown={(e) => startHold(e, -1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, -1)}><Icon name="minus" size={size === 'lg' ? 24 : size === 'sm' ? 15 : 17} /></button>
  <output class="num">{#if caption}<small aria-hidden="true">{caption}</small>{/if}<span class="val">{format(shown)}<PendingEdge {pending}
        confirmed={settle.confirmed} /></span></output>
  <button type="button" class="hit" aria-label={m.stepper.increase(label)} aria-disabled={atMax}
    onpointerdown={(e) => startHold(e, 1)} onpointerup={stopHold} onpointerleave={stopHold} onpointercancel={stopHold}
    onkeydown={(e) => key(e, 1)}><Icon name="plus" size={size === 'lg' ? 24 : size === 'sm' ? 15 : 17} /></button>
</div>

<style>
  /* Tableau « Stepper » (spec §3): an s2 pill (4 px inset) holding two s3 discs (36 px, 32 px small) around
     the value; each disc's hit area reaches 44 px (.hit). The value cross-fades; its underline is the pending
     signal (PendingEdge): dashed while the radiator has not reported it, closing solid when it does. At a
     bound the disc is aria-disabled (focus stays). Inert (reconnecting, offline): the whole pill dims. */
  .stepper {
    --b: 36px;
    display: inline-grid;
    grid-template-columns: var(--b) minmax(64px, 1fr) var(--b);
    align-items: center;
    gap: 6px;
    flex: none;
    padding: 4px;
    border-radius: var(--r-pill);
    background: var(--s2);
    transition: opacity var(--t-state) ease;
  }
  .stepper.sm {
    --b: 32px;
    padding: 3px;
  }
  .stepper.lg {
    --b: 56px;
    padding: 0;
    gap: 12px;
    background: transparent;
  }
  .stepper.block {
    display: grid;
    width: 100%;
  }
  .stepper.inert {
    opacity: 0.4;
  }
  button {
    display: grid;
    place-items: center;
    width: var(--b);
    height: var(--b);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--s3);
    color: var(--tx);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    transition:
      background-color var(--t-state) ease,
      opacity var(--t-state) ease,
      transform var(--t-press) ease;
    --ctl-h: var(--b);
    --hit-x: min(0px, calc((var(--b) - var(--ctl-hit)) / 2));
  }
  .lg button {
    background: var(--s2);
  }
  @media (hover: hover) {
    button:hover:not([aria-disabled='true']) {
      background: color-mix(in srgb, var(--s3) 70%, var(--tx));
    }
  }
  button:active:not([aria-disabled='true']) {
    transform: scale(0.94);
  }
  button[aria-disabled='true'] {
    opacity: 0.35;
    cursor: default;
  }
  output {
    display: grid;
    justify-items: center;
    min-width: 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
  }
  .sm output {
    font-size: 15px;
  }
  .lg output {
    font-size: var(--fs-display);
    letter-spacing: -0.03em;
    line-height: 1;
  }
  small {
    font-size: 11px;
    font-weight: 500;
    color: var(--mu);
    line-height: 1.2;
  }
  /* The underline belongs to the value, so it is as wide as the figure: transparent at rest, dashed while
     pending, closing solid on confirmation (PendingEdge). */
  .val {
    position: relative;
    display: inline-block;
    padding-bottom: 2px;
    --edge-rest: transparent;
  }
  @media (prefers-reduced-motion: reduce) {
    button:active:not([aria-disabled='true']) {
      transform: none;
    }
  }
</style>
