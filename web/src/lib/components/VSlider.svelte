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
     measured temperature as a 2 px heat line with its value. The drag follows the finger with no easing and
     snaps to 0,5 °C on release (60 ms), then sends once; the keyboard steps 0,5 (Page ±1 °C, Home/End) and sends
     after 600 ms, like the stepper. `dim` (off, read-only, offline): faded and inert (aria-disabled, focus kept).
     `pending` dashes the fill's edge until the radiator reports the value. -->
<script lang="ts">
  import { fmtTemp, fmtTempShort } from '$lib/format';
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
    debounceMs?: number;
    onchange: (v: number) => unknown;
  }
  let {
    value, label, min = 10, max = 26, step = 0.5, measured = null, dim = false, pending = false, width = 120, height = 300,
    debounceMs = 600, onchange
  }: Props = $props();

  let track = $state<HTMLElement>();
  let local = $state<number | null>(null);
  let dragging = $state(false);
  let snapping = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown = $derived(local ?? value);
  // A new value from the radiators ends the optimistic display.
  let prev: number | null | undefined;
  $effect(() => {
    const v = value;
    if (prev !== undefined && v !== prev && !dragging) local = null;
    prev = v;
  });
  $effect(() => () => clearTimeout(timer));

  const pct = (v: number | null) => (v == null ? 0 : ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100);
  let ticks = $derived(Array.from({ length: Math.round((max - min) / step) - 1 }, (_, i) => min + (i + 1) * step));

  function commit(v: number) {
    if (v === value) return;
    announcer.say(m.stepper.announce(label, fmtTemp(v)));
    onchange(v);
  }

  function down(e: PointerEvent) {
    if (dim || e.button !== 0 || !track) return;
    dragging = true;
    snapping = false;
    track.setPointerCapture?.(e.pointerId);
    move(e);
  }
  function move(e: PointerEvent) {
    if (!dragging || !track) return;
    const r = track.getBoundingClientRect();
    local = valueAtY(e.clientY, r.top, r.height, min, max);
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (local == null) return;
    snapping = true;
    local = snapTo(local, step, min, max);
    setTimeout(() => (snapping = false), 60);
    commit(local);
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
    local = next;
    clearTimeout(timer);
    const v = next;
    timer = setTimeout(() => commit(v), debounceMs);
  }
</script>

<div bind:this={track} class="vs" class:dim class:dragging class:snapping role="slider" tabindex="0" aria-label={label}
  aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown ?? undefined}
  aria-valuetext={fmtTemp(shown)} aria-disabled={dim} style:width="{width}px" style:height="{height}px"
  style:--r="{Math.round(width * 0.28)}px" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}>
  <span class="fill" class:pending style:height="{pct(shown)}%"></span>
  {#each ticks as t (t)}<i class:whole={t % 1 === 0} style:bottom="{pct(t)}%"></i>{/each}
  {#if measured != null}
    <span class="meas" style:bottom="{pct(measured)}%"></span>
    <span class="ml num" style:bottom="calc({pct(measured)}% + 6px)" aria-hidden="true">{fmtTempShort(measured)}</span>
  {/if}
  {#if shown != null}<span class="grip" style:bottom="calc({pct(shown)}% - 18px)"></span>{/if}
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
  .meas {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--heat);
  }
  .ml {
    position: absolute;
    left: 12px;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--heat);
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
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
    background: var(--mu);
  }
  .dim .ml {
    color: var(--mu);
  }
</style>
