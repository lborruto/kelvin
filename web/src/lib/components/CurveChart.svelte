<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import type { CurvePointView } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtPct, fmtTime, fmtWh } from '$lib/format';

  interface Props {
    points: CurvePointView[];
    label: string;
    /** False without a tariff: there are no HC slots, so the day is drawn as one series. */
    split?: boolean;
  }
  let { points, label, split = true }: Props = $props();

  const W = 600;
  const H = 140;
  const BASE = H - 1;
  let x = $derived(scaleBand<number>().domain(points.map((_, i) => i)).range([0, W]).paddingInner(0.15));
  let y = $derived(scaleLinear().domain([0, Math.max(1, ...points.map((p) => p.wh))]).nice().range([BASE, 6]));
  // Axis: 00, 06, 12, 18 at the matching half hours (positions follow DST days), then 24.
  let ticks = $derived(
    points.flatMap((p, i) => {
      const t = fmtTime(p.ts * 1000);
      return t.endsWith(':00') && Number(t.slice(0, 2)) % 6 === 0 ? [{ i, text: t.slice(0, 2) }] : [];
    })
  );
  const kind = (f: number) => (f >= 1 ? 'heures creuses' : f <= 0 ? 'heures pleines' : 'en partie creuses');
</script>

{#if !points.length}
  <p class="muted empty">Pas de courbe pour ce jour.</p>
{:else}
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={label}>
    {#each points as p, i (p.ts)}
      {@const top = y(p.wh)}
      {@const cut = top + (BASE - top) * (1 - p.offpeak)}
      <g>
        <title>{fmtTime(p.ts * 1000)} · {fmtWh(p.wh)}{split ? ` · ${kind(p.offpeak)}` : ''}</title>
        {#if !split}
          <rect class="all" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, BASE - top)} style:fill={SERIES.home} rx="1" />
        {:else}
          {#if p.offpeak < 1}
            <rect class="hp" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, cut - top)} style:fill={SERIES.hp} rx="1" />
          {/if}
          {#if p.offpeak > 0}
            <rect class="hc" x={x(i)} width={x.bandwidth()} y={cut} height={Math.max(0, BASE - cut)} style:fill={SERIES.hc} rx="1" />
          {/if}
        {/if}
      </g>
    {/each}
  </svg>
  <div class="curve-axis" aria-hidden="true">
    {#each ticks as t (t.i)}<span class="curve-tick" style:left="{((x(t.i) ?? 0) / W) * 100}%">{t.text}</span>{/each}
    <span class="curve-tick end">24</span>
  </div>
  <table class="visually-hidden">
    <caption>{label}</caption>
    <thead>
      <tr><th scope="col">Heure</th><th scope="col">Énergie</th>{#if split}<th scope="col">Heures creuses</th>{/if}</tr>
    </thead>
    <tbody>
      {#each points as p (p.ts)}
        <tr><th scope="row">{fmtTime(p.ts * 1000)}</th><td>{fmtWh(p.wh)}</td>{#if split}<td>{fmtPct(p.offpeak)}</td>{/if}</tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .curve-axis {
    position: relative;
    height: 16px;
    margin-top: 4px;
  }
  .curve-tick {
    position: absolute;
    color: var(--fa);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .end {
    right: 0;
  }
  .empty {
    font-size: 13px;
  }
</style>
