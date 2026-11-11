<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
  import { Settle } from '$lib/settle.svelte';
  import { announcer } from '$lib/stores/announcer.svelte';
  import Icon from './Icon.svelte';
  import PendingEdge from './PendingEdge.svelte';
  import { HOLD_DELAY_MS, HOLD_REPEAT_MS, SEND_IDLE_MS } from '$lib/send';
  import { SendDraft } from '$lib/sendDraft.svelte';

  interface Props {
    value: number | null;
    min: number;
    max: number;
    step?: number;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    /** The idle time after the last tap (or the release of a hold) before the one send. 0 (a local value, nothing
     * sent): every step reports at once. */
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
    /** `lg` only (the room sheet): a line under the value (« Confort · actuellement 19,6 °C »), outside the output. */
    below?: Snippet;
    /** `lg` only (the phone room sheet): drawn between the − and + discs, the value and `below` above them (the slider). */
    between?: Snippet;
    /** The group's id (a « Modifier Confort » link focuses it). */
    id?: string;
    /** Read-out of the value on screen (sent or not): a caller's note follows the draft, not only the radiator. */
    shown?: number | null;
    /** A draft shared with another control of the same value (the room sheet's slider): both continue from the
     * value on screen and one send goes out, by the draft (`onchange` and `debounceMs` are then the draft's). */
    draft?: SendDraft;
  }
  let {
    value, min, max, step = 0.5, label, pending = false, disabled = false,
    debounceMs = SEND_IDLE_MS, format = (v) => fmtTemp(v), announce = true, onchange, caption, size = 'md', block = false, below, between,
    id, shown: shownOut = $bindable(null), draft
  }: Props = $props();

  // The unsent value and its one timer: the caller's (shared with the room sheet's slider) or this stepper's own.
  const d =
    untrack(() => draft) ??
    new SendDraft({ value: () => value, pending: () => pending, debounceMs: () => debounceMs, send: (v) => onchange(v) });
  let shown = $derived(d.local ?? value);
  // A draft not yet sent is dashed too (« pas encore envoyé »).
  let unsent = $derived(d.local !== null && !d.committed && d.local !== value);
  $effect(() => {
    shownOut = shown;
  });
  // The value the radiator was asked for; confirmed when it reports exactly that (shared rule).
  const settle = new Settle(() => (pending ? (d.local ?? value) : null), () => value);
  // At a bound the button stays focusable (aria-disabled): a disabled button would drop focus to <body>.
  let atMin = $derived(disabled || shown === null || shown <= min);
  let atMax = $derived(disabled || shown === null || shown >= max);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatTimer: ReturnType<typeof setInterval> | undefined;
  let holding = false;

  // Closing the sheet or leaving the page while a draft waits sends it now (the draft does); a held press ends first.
  $effect(() => {
    const off = d.onflush(() => {
      stopHold();
      holding = false;
    });
    return () => {
      off();
      stopHold();
    };
  });

  function clamp(v: number) {
    return Math.min(max, Math.max(min, Math.round(v / step) * step));
  }

  /** Restart the idle wait: the one send happens `debounceMs` after the last interaction. */
  const arm = () => d.arm();
  // One announcement per settled choice, not per tap or hold step.
  const say = (v: number) => announcer.say(m.stepper.announce(label, format(v)));

  function bump(dir: 1 | -1): boolean {
    if (disabled) return false;
    // No known value (e.g. radiators disagree and nothing aggregated it): nothing to step from.
    const base = d.local ?? value;
    if (base === null) return false;
    const next = clamp(base + dir * step);
    if (next === base) return false;
    // Nothing goes out while a press is held; the wait starts at its release.
    d.set(next, announce ? say : undefined);
    if (!holding || debounceMs <= 0) arm();
    return true;
  }

  // A touch is a step only once it is a tap: the step comes on the release, never on the touch itself. A finger
  // that starts a scroll on −/+ (the browser cancels the pointer) or slides off the button changes nothing
  // (2026-11-08: a scroll over « + » right after « Terminer » sent « Confort + 0,5 »). Holding still repeats.
  let heldSteps = 0;

  function startHold(e: PointerEvent, dir: 1 | -1) {
    if (e.button !== 0) return;
    stopHold();
    holding = true;
    heldSteps = 0;
    // Press and hold: after 500 ms, one step, then one every 150 ms; still one send, after the release.
    holdTimer = setTimeout(() => {
      if (!bump(dir)) return;
      heldSteps++;
      repeatTimer = setInterval(() => {
        if (bump(dir)) heldSteps++;
        else clearInterval(repeatTimer);
      }, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  }

  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
  }

  /** The finger lifted on the button: a tap steps once; a hold has stepped already. */
  function lift(dir: 1 | -1) {
    if (!holding) return;
    const tapped = heldSteps === 0;
    holding = false;
    stopHold();
    if (tapped) bump(dir);
    arm();
  }

  /** The pointer left or the browser took it (a scroll): a tap that never was changes nothing. */
  function endHold() {
    if (!holding) return;
    holding = false;
    stopHold();
    if (heldSteps > 0) arm();
  }

  function key(e: KeyboardEvent, dir: 1 | -1) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      bump(dir);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      bump(1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      bump(-1);
    }
  }
</script>

<div class="stepper {size}" class:pending={pending || unsent} class:block class:inert={disabled} class:around={!!between} class:with-below={!!below} role="group"
  aria-label={label} {id}>
  <button type="button" class="hit dec" aria-label={m.stepper.decrease(label)} aria-disabled={atMin}
    onpointerdown={(e) => startHold(e, -1)} onpointerup={() => lift(-1)} onpointerleave={endHold} onpointercancel={endHold}
    onkeydown={(e) => key(e, -1)}><Icon name="minus" size={size === 'lg' ? 24 : size === 'sm' ? 15 : 17} /></button>
  <output class="num">{#if caption}<small aria-hidden="true">{caption}</small>{/if}<span class="val">{format(shown)}<PendingEdge pending={pending || unsent}
        confirmed={settle.confirmed} /></span></output>
  {#if below}<div class="below">{@render below()}</div>{/if}
  {#if between}<div class="mid">{@render between()}</div>{/if}
  <button type="button" class="hit inc" aria-label={m.stepper.increase(label)} aria-disabled={atMax}
    onpointerdown={(e) => startHold(e, 1)} onpointerup={() => lift(1)} onpointerleave={endHold} onpointercancel={endHold}
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
  /* The room sheet's layouts: the line under the value; on the phone the value and its line on top, the
     slider between the discs. */
  .stepper.lg.with-below {
    grid-template-areas: 'dec out inc' 'below below below';
    row-gap: 6px;
  }
  .stepper.lg.around {
    grid-template-columns: var(--b) minmax(0, 1fr) var(--b);
    grid-template-areas: 'out out out' 'below below below' 'dec mid inc';
    row-gap: 6px;
  }
  .lg .dec {
    grid-area: dec;
  }
  .lg .inc {
    grid-area: inc;
  }
  .lg output {
    grid-area: out;
  }
  .below {
    grid-area: below;
    min-width: 0;
    text-align: center;
  }
  .mid {
    grid-area: mid;
    display: grid;
    justify-items: center;
    min-width: 0;
    margin-top: 12px;
  }
  /* A phone tile at 320 px leaves ~115 px: the value column may shrink below 64 px (« 19,5° » needs ~40). */
  .stepper.sm.block {
    grid-template-columns: var(--b) minmax(0, 1fr) var(--b);
    gap: 4px;
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
