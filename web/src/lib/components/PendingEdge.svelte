<!--
  The signature mark, drawn once for every control that sends a command: dashed while pending,
  closing into a solid line in 250 ms when the radiator confirms (DESIGN: the dashed → solid move).
  `line` is an underline (stepper value, card setpoint); `rect` is an edge around its positioned
  parent (mode switch segment, toggle track). The host sets --edge-rest for the resting stroke
  (none by default: the mark only exists while it means something).
-->
<script lang="ts">
  interface Props {
    shape?: 'line' | 'rect';
    pending?: boolean;
    confirmed?: boolean;
    /** Corner radius of the rect, in px. */
    rx?: number;
  }
  let { shape = 'line', pending = false, confirmed = false, rx = 0 }: Props = $props();
</script>

<svg class="edge {shape}" class:pending class:confirmed aria-hidden="true">
  {#if shape === 'line'}
    <line x1="0" x2="100%" y1="1" y2="1" />
  {:else}
    <rect x="0.5" y="0.5" {rx} />
  {/if}
</svg>

<style>
  .edge {
    position: absolute;
    pointer-events: none;
    overflow: visible;
  }
  .line {
    left: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
  }
  .rect {
    inset: 0;
    width: 100%;
    height: 100%;
  }
  rect {
    width: calc(100% - 1px);
    height: calc(100% - 1px);
    fill: none;
  }
  line,
  rect {
    stroke: var(--edge-rest, transparent);
    stroke-width: var(--edge-width, 1);
    transition: stroke var(--t-state) ease;
  }
  line {
    stroke-width: var(--edge-width, 2);
  }
  .pending :is(line, rect) {
    stroke: var(--edge-on, var(--mu));
    stroke-dasharray: 4 3;
  }
  .confirmed :is(line, rect) {
    stroke: var(--edge-on, var(--mu));
    animation: kv-solidify var(--t-morph) var(--ease-out) forwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .confirmed :is(line, rect) {
      animation: kv-solidify-rm var(--t-exit) linear forwards;
    }
  }
</style>
