<!-- The 24 h tariff band (spec §3 « MaintenantCard », decision 3): the civil day as HC blocks (light blue, always
     hatched) and HP (solid dark blue), never a heat colour and never a Tempo colour. The now marker is a 3 px
     ink bar with the time above it. An image named by the off-peak hours in words; the caller writes them
     beside it too. Blocks come from `$lib/maintenant` (`dayBlocks`). -->
<script lang="ts">
  import { seriesBackground } from '$lib/energy';
  import type { Block } from '$lib/maintenant';

  interface Props {
    blocks: Block[];
    /** The image's name (« Heures creuses 22:00–06:00 »). */
    label: string;
    /** Minute of the day for the now marker; none when null. */
    now?: number | null;
    /** The time over the marker (« 18:42 »). */
    nowLabel?: string | null;
    ticks?: boolean;
    height?: number;
  }
  let { blocks, label, now = null, nowLabel = null, ticks = true, height = 12 }: Props = $props();
  const TICKS = ['00', '06', '12', '18', '24'];
  const pct = (min: number) => `${(min / 1440) * 100}%`;
</script>

<div class="band" class:labelled={!!nowLabel}>
  {#if nowLabel && now != null}<span class="nowl num" aria-hidden="true" style:--x={now / 1440}>{nowLabel}</span>{/if}
  <div class="bar" role="img" aria-label={label} style:height="{height}px">
    {#each blocks as b, i (i)}<span class="blk {b.period}" style:left={pct(b.from)} style:width={pct(b.to - b.from)}
        style:background={b.period === 'hc' ? seriesBackground('hc') : 'var(--hp)'}></span>{/each}
    {#if now != null}<span class="now" style:left={pct(now)}></span>{/if}
  </div>
  {#if ticks}<div class="ticks num" aria-hidden="true">{#each TICKS as t (t)}<span>{t}</span>{/each}</div>{/if}
</div>

<style>
  .band {
    position: relative;
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .band.labelled {
    padding-top: 16px;
  }
  .bar {
    position: relative;
    border-radius: 4px;
    background: var(--hp);
  }
  .blk {
    position: absolute;
    top: 0;
    bottom: 0;
  }
  /* A 1 px knockout between HC and HP, as on the Énergie stacks. */
  .blk.hp + .blk.hc,
  .blk.hc + .blk.hp {
    box-shadow: inset 1px 0 0 var(--s1);
  }
  .blk:first-child {
    border-radius: 4px 0 0 4px;
  }
  .blk:last-of-type {
    border-radius: 0 4px 4px 0;
  }
  .now {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 1.5px;
    background: var(--tx);
    box-shadow: 0 0 0 1.5px var(--s1);
  }
  .nowl {
    position: absolute;
    top: 0;
    left: clamp(0px, calc(var(--x) * 100% - 16px), calc(100% - 32px));
    width: 32px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    line-height: 14px;
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    color: var(--fa);
    font-size: 11px;
  }
</style>
