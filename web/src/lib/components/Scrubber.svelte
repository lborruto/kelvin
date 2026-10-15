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
    onchange: (i: number | null) => void;
  }
  let { centers, W, index, label, valuetext, idle, onchange }: Props = $props();
  let el: HTMLDivElement | undefined = $state();
  const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

  function at(e: PointerEvent): number | null {
    const r = el!.getBoundingClientRect();
    return nearestIndex(centers, (e.clientX - r.left) * (r.width > 0 ? W / r.width : 1));
  }
  function onpointerdown(e: PointerEvent) {
    // Keep receiving the drag even when the finger leaves the chart.
    try {
      el?.setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer with that id (synthetic events): nothing to capture */
    }
    onchange(at(e));
  }
  function onpointermove(e: PointerEvent) {
    if (e.pointerType === 'mouse' || e.buttons) onchange(at(e));
  }
  function onkeydown(e: KeyboardEvent) {
    const n = centers.length;
    if (e.key === 'Escape') {
      if (index != null) {
        e.preventDefault();
        onchange(null);
      }
      return;
    }
    if (!n || !KEYS.has(e.key)) return;
    e.preventDefault();
    const back = e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === 'End';
    onchange(index == null ? (back ? n - 1 : 0) : stepIndex(e.key, index, n));
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
