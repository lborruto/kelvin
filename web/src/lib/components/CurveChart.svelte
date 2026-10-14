<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import Scrubber from './Scrubber.svelte';
  import type { EnergyInterval, RoomSample } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtTime, fmtWh } from '$lib/format';
  import { inspectionTable, intervalLabel, READOUT_ORDER, readInterval } from '$lib/inspector';

  const COPY = {
    empty: 'Pas de courbe pour ce jour.',
    scrub: 'Parcourir la courbe, demi-heure par demi-heure',
    idle: 'Survolez ou touchez la courbe, ou utilisez les flèches.',
    idleShort: 'aucune demi-heure choisie',
    hour: 'Heure',
    est: 'est.',
    radiators: 'Radiateurs',
    kva: (kva: number) => `Puissance souscrite (${kva}\u00a0kVA)`,
    kvaOff: (kva: number, wh: string) => `Puissance souscrite (${kva}\u00a0kVA, soit ${wh} par demi-heure) hors de l’échelle du graphique.`
  } as const;

  interface Props {
    intervals: EnergyInterval[];
    label: string;
    /** False without a tariff: the day is drawn as one series and the readout has no price. */
    split?: boolean;
    /** Subscribed power: a faint dashed line at kVA × 1000 × 0.5 Wh per half-hour (power factor 1). */
    kva?: number | null;
    /** The selected room's 5-min samples: the readout's « Température » row. */
    samples?: RoomSample[] | null;
    /** The scrubbed interval, shared with Température et chauffe. */
    index?: number | null;
  }
  let { intervals, label, split = true, kva = null, samples = null, index = $bindable(null) }: Props = $props();

  let width = $state(0);
  let W = $derived(width > 0 ? width : 600);
  const H = 140;
  const BASE = H - 1;
  let x = $derived(scaleBand<number>().domain(intervals.map((_, i) => i)).range([0, W]).paddingInner(0.15));
  let dataMax = $derived(Math.max(1, ...intervals.map((p) => Math.max(p.wh, p.radiators_wh ?? 0))));
  let kvaWh = $derived(kva != null ? kva * 1000 * 0.5 : null);
  // Drawn only within 2× the data, so a 12 kVA line never flattens a quiet day; otherwise stated.
  let kvaShown = $derived(kvaWh != null && kvaWh <= 2 * dataMax);
  let y = $derived(scaleLinear().domain([0, kvaShown && kvaWh != null ? Math.max(dataMax, kvaWh) : dataMax]).nice().range([BASE, 6]));
  let centers = $derived(intervals.map((_, i) => (x(i) ?? 0) + x.bandwidth() / 2));
  // Axis: 00, 06, 12, 18 at the matching half hours (positions follow DST days), then 24.
  let ticks = $derived(
    intervals.flatMap((p, i) => {
      const t = fmtTime(p.ts * 1000);
      return t.endsWith(':00') && Number(t.slice(0, 2)) % 6 === 0 ? [{ i, text: t.slice(0, 2) }] : [];
    })
  );
  /** The radiators as a step line across each half-hour; an unknown half-hour breaks the line. */
  let radPath = $derived.by(() => {
    let d = '';
    let open = false;
    intervals.forEach((p, i) => {
      const r = p.radiators_wh;
      if (r == null) {
        open = false;
        return;
      }
      const x0 = x(i) ?? 0;
      d += `${open ? 'L' : 'M'}${x0},${y(r)}H${x0 + x.step()}`;
      open = true;
    });
    return d;
  });
  let ctx = $derived({ intervals, samples, tariff: split });
  let current = $derived(index != null && intervals[index] ? intervals[index] : null);
  let readout = $derived(readInterval(current, ctx));
  let readings = $derived(intervals.map((p) => readInterval(p, ctx)));
  let table = $derived(inspectionTable(intervals.map((p, i) => ({ head: intervalLabel(p, intervals), ins: readings[i] })), READOUT_ORDER));
  /** Fields that say why they read « — » on some half-hour of the day: their reason line is always reserved, so scrubbing never reflows (R2). */
  let reasoned = $derived(new Set(readings.flatMap((r) => r.rows.filter((x) => x.note).map((x) => x.key))));
</script>

{#if !intervals.length}
  <p class="muted empty">{COPY.empty}</p>
{:else}
  <!-- A fixed row above the chart, so nothing covers the bars; its fields never change for the day. -->
  <dl class="readout">
    <div class="when"><dt class="visually-hidden">{COPY.hour}</dt><dd class="num">{current ? readout.title : COPY.idle}</dd></div>
    {#each readout.rows as r (r.key)}
      <div class="field">
        <dt>{r.label}</dt>
        <dd class="num">{r.value}{#if r.est}<span class="est">{COPY.est}</span>{/if}{#if r.note || reasoned.has(r.key)}<span class="why">{r.note ?? ''}</span>{/if}</dd>
      </div>
    {/each}
  </dl>
  <div class="plot" bind:clientWidth={width}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
      {#each intervals as p, i (p.ts)}
        {@const top = y(p.wh)}
        {@const f = split && p.offpeak != null ? p.offpeak : null}
        {@const cut = f != null ? top + (BASE - top) * (1 - f) : BASE}
        <g style:--i={i}>
          {#if f == null}
            <rect class="all" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, BASE - top)} style:fill={SERIES.home} rx="1" />
          {:else}
            {#if f < 1}
              <rect class="hp" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, cut - top)} style:fill={SERIES.hp} rx="1" />
            {/if}
            {#if f > 0}
              <rect class="hc" x={x(i)} width={x.bandwidth()} y={cut} height={Math.max(0, BASE - cut)} style:fill={SERIES.hc} rx="1" />
            {/if}
          {/if}
        </g>
      {/each}
      {#if kvaShown && kvaWh != null}
        <line class="kva" x1="0" x2={W} y1={y(kvaWh)} y2={y(kvaWh)} />
      {/if}
      {#if radPath}
        <path class="rad-knock" d={radPath} />
        <path class="rad" d={radPath} style:stroke={SERIES.radiators} />
      {/if}
      {#if current && index != null}
        <line class="cross" x1={centers[index]} x2={centers[index]} y1="0" y2={H} />
      {/if}
    </svg>
    <Scrubber
      {centers}
      {W}
      {index}
      label={COPY.scrub}
      idle={COPY.idleShort}
      valuetext={(i) => readings[i].spoken}
      onchange={(i) => (index = i)} />
  </div>
  <div class="curve-axis" aria-hidden="true">
    {#each ticks as t (t.i)}<span class="curve-tick" style:left="{((x(t.i) ?? 0) / W) * 100}%">{t.text}</span>{/each}
    <span class="curve-tick end">24</span>
  </div>
  {#if radPath || kvaWh != null}
    <ul class="legend">
      {#if radPath}<li><span class="line" style:background={SERIES.radiators}></span>{COPY.radiators}</li>{/if}
      {#if kvaShown && kva != null}<li><span class="dash"></span>{COPY.kva(kva)}</li>{/if}
    </ul>
    {#if kva != null && !kvaShown}<p class="muted kva-note">{COPY.kvaOff(kva, fmtWh(kvaWh))}</p>{/if}
  {/if}
  <div class="visually-hidden"><table>
    <caption>{label}</caption>
    <thead>
      <tr><th scope="col">{COPY.hour}</th>{#each table.columns as c (c.key)}<th scope="col">{c.label}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each table.rows as r, i (i)}
        <tr><th scope="row">{r.head}</th>{#each r.cells as c, j (j)}<td>{c}</td>{/each}</tr>
      {/each}
    </tbody>
  </table></div>
{/if}

<style>
  .readout {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 4px 14px;
    margin: 0 0 10px;
    font-size: 12px;
  }
  .when {
    grid-column: 1 / -1;
    font-size: 13px;
    font-weight: 600;
  }
  .field dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
  }
  .field dd {
    font-size: 13px;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  /* Why a field reads « — » (e.g. « 2 sur 3 radiateurs mesurés »): one line, reserved even when empty (R2). */
  .why {
    display: block;
    min-height: 1lh;
    font-size: 11px;
    color: var(--mu);
  }
  .plot {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
    max-width: 100%;
  }
  g {
    transform-box: fill-box;
    transform-origin: bottom;
    animation: kv-grow var(--t-data) var(--ease-out) both;
    animation-delay: min(calc(var(--i) * 4ms), 180ms);
  }
  @media (prefers-reduced-motion: reduce) {
    g {
      animation: kv-fade-in var(--t-exit) linear both;
    }
  }
  /* The crosshair and the lines are drawn, never animated: they follow the pointer. */
  .cross {
    stroke: var(--tx);
    stroke-width: 1;
    pointer-events: none;
  }
  .kva {
    stroke: var(--fa);
    stroke-width: 1;
    stroke-dasharray: 4 4;
  }
  .rad,
  .rad-knock {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .rad {
    stroke-width: 2;
  }
  .rad-knock {
    stroke: var(--s1);
    stroke-width: 4;
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
  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 0;
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }
  .dash {
    width: 14px;
    border-top: 1px dashed var(--fa);
  }
  .kva-note {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .empty {
    font-size: 13px;
  }
</style>
