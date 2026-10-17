<script lang="ts">
  import { nearestIndex, stepIndex } from '$lib/chart';

  interface Props {
    /** Interval centres in the chart's own units (0…W). */
    centers: number[];
    W: number;
    index: number | null;
    label: string;
    valuetext: (i: number) => string;
    /** What the slider says before anything is chosen. */
    idle: string;
    /** `via`: a key, a mouse hover, or a press (touch, pen, mouse click): the host may announce a press. */
    onchange: (i: number | null, via?: 'key' | 'hover' | 'press') => void;
    /** The index the first arrow key starts from (the room chart: now); default the first or the last. */
    start?: number | null;
    /** A mouse leaving the plot clears the choice (the room chart's hover inspector). */
    leave?: boolean;
    /** A tap on the chosen interval clears it (the room chart's phone sheet closes on a second tap). */
    toggle?: boolean;
  }
  let { centers, W, index, label, valuetext, idle, onchange, start = null, leave = false, toggle = false }: Props = $props();
  let el: HTMLDivElement | undefined = $state();
  const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

  function at(e: PointerEvent): number | null {
    const r = el!.getBoundingClientRect();
    return nearestIndex(centers, (e.clientX - r.left) * (r.width > 0 ? W / r.width : 1));
  }
  // A press that has not moved yet on the interval already chosen: a tap there clears it (`toggle`).
  let tap: { i: number | null; x: number; was: number | null } | null = null;
  function onpointerdown(e: PointerEvent) {
    // Keep receiving the drag even when the finger leaves the chart.
    try {
      el?.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer with that id (synthetic events): nothing to capture */
    }
    const i = at(e);
    tap = { i, x: e.clientX, was: index };
    onchange(i, 'press');
  }
  function onpointermove(e: PointerEvent) {
    if (tap && Math.abs(e.clientX - tap.x) > 6) tap = null;
    if (e.pointerType === 'mouse' && !e.buttons) onchange(at(e), 'hover');
    else if (e.buttons) onchange(at(e), 'press');
  }
  function onpointerup(e: PointerEvent) {
    const t = tap;
    tap = null;
    if (toggle && t && e.pointerType !== 'mouse' && t.was != null && t.was === t.i) onchange(null, 'press');
  }
  function onpointerleave(e: PointerEvent) {
    tap = null;
    if (leave && e.pointerType === 'mouse' && !e.buttons && index != null) onchange(null, 'hover');
  }
  function onkeydown(e: KeyboardEvent) {
    const n = centers.length;
    if (e.key === 'Escape') {
      if (index != null) {
        e.preventDefault();
        // The chart lives in a modal dialog: the first Esc clears the moment, it does not close the sheet.
        e.stopPropagation();
        onchange(null, 'key');
      }
      return;
    }
    if (!n || !KEYS.has(e.key)) return;
    e.preventDefault();
    const back = e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === 'End';
    const from = start != null && e.key !== 'Home' && e.key !== 'End' ? Math.max(0, Math.min(n - 1, start)) : null;
    onchange(index == null ? (from ?? (back ? n - 1 : 0)) : stepIndex(e.key, index, n), 'key');
  }
</script>

<div
  bind:this={el}
  class="scrub"
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={Math.max(0, centers.length - 1)}
  aria-valuenow={index ?? 0}
  aria-valuetext={index != null ? valuetext(index) : idle}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  {onpointerleave}
  {onkeydown}></div>

<style>
  /* Over the whole plot and 12 px past its top and bottom, so a finger just off the bars still scrubs; only x picks
     the interval (the nearest wins). Above the readout's margin and the axis labels, never over a control; vertical
     drags still scroll the page (pan-y). */
  .scrub {
    position: absolute;
    inset: -12px 0;
    z-index: 1;
    touch-action: pan-y;
    cursor: crosshair;
    border-radius: 4px;
  }
</style>
