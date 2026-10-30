<script lang="ts" module>
  /** Snap to the step (0,5 °C) inside the bounds. */
  export function snapTo(v: number, step: number, min: number, max: number): number {
    const s = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Math.round(s * 100) / 100));
  }
  /** The raw value under a pointer at `y` on a track whose top is `top` and height `h` (bottom = min). */
  export function valueAtY(y: number, top: number, h: number, min: number, max: number): number {
    const f = 1 - (y - top) / Math.max(1, h);
    return Math.min(max, Math.max(min, min + f * (max - min)));
  }
</script>

<!-- The vertical slider (spec §3 « VSlider », amendment 2): secondary to −/+, on the room sheet only. An s2 track
     (120–140 × 200–320, radius 28 % of its width) filled in ink from 10 °C to the setpoint, ticks every 0,5, the
     measured temperature as a muted dashed line tagged « Actuel 17,6° » on the left (never heat: it is not the
     target), labels every 2 °C on the right; while it moves, a bubble on the handle says the target (« 20,5 °C »,
     snapped), beside the finger on touch, and `shown` lets the large figure follow live. The drag follows the finger with no easing and
     snaps to 0,5 °C on release (60 ms); the keyboard steps 0,5 (Page ±1 °C, Home/End). Like the stepper, it sends
     once, 1,5 s after the last release (`$lib/send`), dashed until then; closing or leaving sends a waiting value. `dim` (off, read-only, offline): faded and inert (aria-disabled, focus kept).
     `pending` dashes the fill's edge until the radiator reports the value. -->
<script lang="ts">
  import { fmtTemp, fmtTempShort, fmtTempTick } from '$lib/format';
  import { SEND_IDLE_MS } from '$lib/send';
  import { announcer } from '$lib/stores/announcer.svelte';
  import { m } from '$lib/i18n';

  interface Props {
    value: number | null;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    measured?: number | null;
    dim?: boolean;
    pending?: boolean;
    width?: number;
    height?: number;
    /** The idle time after a release (pointer or key) before the one send. */
    debounceMs?: number;
    onchange: (v: number) => unknown;
    /** Read-out of the target on screen (snapped while dragging): the room sheet's large figure follows it live. */
    shown?: number | null;
  }
  let {
    value, label, min = 10, max = 26, step = 0.5, measured = null, dim = false, pending = false, width = 120, height = 300,
    debounceMs = SEND_IDLE_MS, onchange, shown: shownOut = $bindable(null)
  }: Props = $props();

  let track = $state<HTMLElement>();
  let local = $state<number | null>(null);
  let dragging = $state(false);
  let snapping = $state(false);
  // A value moved to but not sent yet: dashed like a pending one (« pas encore envoyé »).
  let unsent = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The target, snapped to the step even mid-drag: the bubble, the large figure and aria-valuetext say the value
  // that will be sent, never the raw finger position.
  let shown = $derived(local != null ? snapTo(local, step, min, max) : value);
  // The finger's side (touch): the bubble goes to the other half so the finger never covers it.
  let fingerRight = $state(false);
  let touch = $state(false);
  let bubble = $derived(!dim && shown != null && (dragging || unsent));
  $effect(() => {
    shownOut = shown;
  });
  // A new value from the radiators ends the optimistic display (never a draft still waiting to be sent).
  let prev: number | null | undefined;
  $effect(() => {
    const v = value;
    if (prev !== undefined && v !== prev && !dragging && !unsent) local = null;
    prev = v;
  });

  const pct = (v: number | null) => (v == null ? 0 : ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100);
  let ticks = $derived(Array.from({ length: Math.round((max - min) / step) - 1 }, (_, i) => min + (i + 1) * step));
  // A readable scale: a label every 2 °C, inside the bounds.
  let labels = $derived(ticks.filter((t) => t % 2 === 0));

  function commit() {
    clearTimeout(timer);
    timer = undefined;
    const v = local;
    unsent = false;
    if (v == null || v === value) return;
    announcer.say(m.stepper.announce(label, fmtTemp(v)));
    onchange(v);
  }
  /** The one send, `debounceMs` after the last release; a new touch or key restarts the wait. */
  function arm() {
    clearTimeout(timer);
    if (local == null || local === value) {
      unsent = false;
      return;
    }
    unsent = true;
    timer = setTimeout(commit, debounceMs);
  }
  function hold() {
    clearTimeout(timer);
    timer = undefined;
  }
  // Closing the sheet or leaving the page sends a waiting value at once.
  function flush() {
    if (timer !== undefined) commit();
  }
  $effect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  });

  function down(e: PointerEvent) {
    if (dim || e.button !== 0 || !track) return;
    dragging = true;
    snapping = false;
    touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    hold();
    try {
      track.setPointerCapture?.(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still follows move events on the track.
    }
    move(e);
  }
  function move(e: PointerEvent) {
    if (!dragging || !track) return;
    const r = track.getBoundingClientRect();
    local = valueAtY(e.clientY, r.top, r.height, min, max);
    fingerRight = e.clientX > r.left + r.width / 2;
    unsent = true;
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (local == null) return;
    snapping = true;
    local = snapTo(local, step, min, max);
    setTimeout(() => (snapping = false), 60);
    arm();
  }
  function key(e: KeyboardEvent) {
    if (dim) return;
    const base = shown ?? min;
    const d: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 1, PageDown: -1 };
    let next: number | null = null;
    if (e.key in d) next = snapTo(base + d[e.key], step, min, max);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next == null) return;
    e.preventDefault();
    touch = false;
    local = next;
    // A key held repeats keydown: the wait restarts on each, and again on its release (keyup).
    arm();
  }
  function keyUp() {
    if (timer !== undefined) arm();
  }
</script>

<div bind:this={track} class="vs" class:dim class:dragging class:snapping role="slider" tabindex="0" aria-label={label}
  aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown ?? undefined}
  aria-valuetext={fmtTemp(shown)} aria-disabled={dim} style:width="{width}px" style:height="{height}px"
  style:--r="{Math.round(width * 0.28)}px" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key} onkeyup={keyUp}>
  <span class="fill" class:pending={pending || unsent} style:height="{pct(shown)}%"></span>
  {#each ticks as t (t)}<i class:whole={t % 1 === 0} style:bottom="{pct(t)}%"></i>{/each}
  {#each labels as t (t)}<span class="tl num" style:bottom="calc({pct(t)}% - 7px)" aria-hidden="true">{fmtTempTick(t)}</span>{/each}
  {#if measured != null}
    <!-- The room's reading: muted and named « Actuel », never the heat colour, so it never reads as the target. -->
    <span class="meas" style:bottom="{pct(measured)}%"></span>
    <span class="ml num" style:bottom="calc({pct(measured)}% + 4px)" aria-hidden="true">{m.slider.current(fmtTempShort(measured))}</span>
  {/if}
  {#if shown != null}<span class="grip" style:bottom="calc({pct(shown)}% - 18px)"></span>{/if}
  {#if bubble}
    <!-- The target while it moves: high contrast, on the handle, beside the finger on touch. -->
    <span class="bubble num" class:side={touch} class:left={touch && fingerRight} class:right={touch && !fingerRight}
      style:bottom="min(calc({pct(shown)}% + 10px), calc(100% - 34px))" aria-hidden="true">{fmtTemp(shown)}</span>
  {/if}
</div>

<style>
  .vs {
    position: relative;
    flex: none;
    margin: 0 auto;
    overflow: hidden;
    border-radius: var(--r);
    background: var(--s2);
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
  }
  .vs:focus-visible {
    outline-offset: 3px;
  }
  .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--tx);
  }
  .snapping .fill,
  .snapping .grip {
    transition:
      height var(--t-snap) linear,
      bottom var(--t-snap) linear;
  }
  /* Pending: the fill's top edge dashed until the radiator reports the value (the shared signature). */
  .fill.pending::before {
    content: '';
    position: absolute;
    top: -3px;
    left: 8px;
    right: 8px;
    border-top: 2px dashed var(--mu);
  }
  i {
    position: absolute;
    right: 8px;
    width: 4px;
    height: 1px;
    background: var(--bg);
    opacity: 0.18;
  }
  i.whole {
    width: 8px;
  }
  /* The reading: a muted dashed line across the track and its « Actuel » tag on the left edge. */
  .meas {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 2px dashed var(--mu);
  }
  .ml {
    position: absolute;
    z-index: 1;
    left: 6px;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--mu);
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    white-space: nowrap;
  }
  /* The scale: a label every 2 °C on the right edge. */
  .tl {
    position: absolute;
    right: 4px;
    padding: 0 3px;
    border-radius: 3px;
    background: var(--bg);
    color: var(--mu);
    font-size: 10px;
    line-height: 14px;
  }
  /* The target while dragging or keying: ink on the page background, above everything in the track. */
  .bubble {
    position: absolute;
    left: 50%;
    z-index: 2;
    transform: translateX(-50%);
    padding: 3px 8px;
    border-radius: 8px;
    background: var(--bg);
    color: var(--tx);
    box-shadow: 0 0 0 1px var(--tx);
    font-size: 15px;
    font-weight: 700;
    line-height: 20px;
    white-space: nowrap;
    pointer-events: none;
  }
  .bubble.left {
    left: 6px;
    transform: none;
  }
  .bubble.right {
    left: auto;
    right: 6px;
    transform: none;
  }
  .grip {
    position: absolute;
    left: 50%;
    width: 36px;
    height: 5px;
    margin-left: -18px;
    border-radius: 3px;
    background: var(--bg);
    opacity: 0.45;
  }
  .dim {
    opacity: 0.35;
    cursor: default;
  }
  .dim .meas {
    border-top-color: var(--fa);
  }
  .dim .ml {
    color: var(--mu);
  }
</style>
