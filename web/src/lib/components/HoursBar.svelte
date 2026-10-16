<!-- Off-peak hours on a 24 h bar (direction-2 §3 « /home/tariff », DESIGN « HoursBar »): tariff, not heat, so
     never warm. The off-peak blocks are `--hc` with the hatch, the rest of the day solid `--hp`: the two
     tariff blues the Énergie charts and the form swatches speak. A slot past midnight is drawn as its two
     halves. The words (« 22:00–06:00 ») are always written beside it by the caller; the bar is an image
     named by the same words. -->
<script lang="ts">
  import type { Slot } from '$lib/api/types';
  import { seriesBackground } from '$lib/energy';
  import { hourBlocks } from '$lib/tariff';

  interface Props {
    slots: Slot[];
    /** The image's name (the off-peak hours in words). */
    label: string;
    /** Without the 00 · 06 · 12 · 18 · 24 scale (the Maison card). */
    compact?: boolean;
  }
  let { slots, label, compact = false }: Props = $props();

  let parts = $derived(hourBlocks(slots));
  const TICKS = ['00', '06', '12', '18', '24'];
</script>

<div class="hours" class:compact>
  <div class="bar" role="img" aria-label={label}>
    {#each parts as p, i (i)}<span class="hc" style:left="{p.left}%" style:width="{p.width}%" style:background={seriesBackground('hc')}
      ></span>{/each}
  </div>
  {#if !compact}
    <div class="scale" aria-hidden="true">{#each TICKS as t (t)}<span>{t}</span>{/each}</div>
  {/if}
</div>

<style>
  .hours {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .bar {
    position: relative;
    height: 16px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--hp);
  }
  .compact .bar {
    height: 10px;
    border-radius: 3px;
  }
  .hc {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .scale {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--fa);
    font-variant-numeric: tabular-nums;
  }
</style>
