<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import Scrubber from './Scrubber.svelte';
  import type { EnergyInterval, RoomSample } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtTime, fmtWh } from '$lib/format';
  import { m } from '$lib/i18n';
  import { inspectionTable, intervalLabel, READOUT_ORDER, readInterval, type Row } from '$lib/inspector';

  interface Props {
    intervals: EnergyInterval[];
    label: string;
    /** False without a tariff: the day is drawn as one series and the readout has no price. */
    split?: boolean;
    /** Subscribed power: a faint dashed line at kVA × 1000 × 0.5 Wh per half-hour (power factor 1). */
    kva?: number | null;
    /** The selected room's 5-min samples: the readout's « Température » row. */
    samples?: RoomSample[] | null;
    /** The selected room's name: the readout says whose temperature it is. */
    room?: string | null;
    /** The scrubbed interval, shared with Température et chauffe. */
    index?: number | null;
  }
  let { intervals, label, split = true, kva = null, samples = null, room = null, index = $bindable(null) }: Props = $props();

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
  let ctx = $derived({ intervals, samples, room, tariff: split });
  let current = $derived(index != null && intervals[index] ? intervals[index] : null);
  let readout = $derived(readInterval(current, ctx));
  let readings = $derived(intervals.map((p) => readInterval(p, ctx)));
  let table = $derived(inspectionTable(intervals.map((p, i) => ({ head: intervalLabel(p, intervals), ins: readings[i] })), READOUT_ORDER));
  /**
   * Every text each field takes over the day (idle included): all are laid out in one grid cell, only the current one
   * visible. The browser sizes each field to its widest and tallest text in the real font, at any zoom or fallback, and
   * that size depends on the day only, so scrubbing never reflows the row (R2).
   */
  const variantId = (x: Row) => `${x.value}\u0001${x.est ? 1 : 0}\u0001${x.note ?? ''}`;
  let variants = $derived.by(() => {
    const byKey = new Map<string, Map<string, Row>>();
    for (const r of [readInterval(null, ctx), ...readings]) {
      for (const x of r.rows) {
        const vs = byKey.get(x.key) ?? new Map<string, Row>();
        if (!vs.has(variantId(x))) vs.set(variantId(x), x);
        byKey.set(x.key, vs);
      }
    }
    return byKey;
  });
</script>

{#if !intervals.length}
  <p class="muted empty">{m.curve.empty}</p>
{:else}
  <!-- A fixed row above the chart, so nothing covers the bars; its fields never change for the day. -->
  <dl class="readout">
    <div class="when">
      <dt class="visually-hidden">{m.curve.hour}</dt>
      <dd class="num">{#if current}{readout.title}{:else}{m.curve.idle}<span class="wide">{m.curve.idleKeys}</span>{/if}</dd>
    </div>
    {#each readout.rows as r (r.key)}
      {@const cur = variantId(r)}
      <div class="field">
        <dt>{r.label}</dt>
        <dd class="num">
          {#each variants.get(r.key) ?? [] as [id, v] (id)}
            <span class="v" class:cur={id === cur} aria-hidden={id === cur ? undefined : 'true'}>
              <span class="val">{v.value}{#if v.est}<span class="est">{m.curve.est}</span>{/if}</span>{#if v.note}<span class="why">{v.note}</span>{/if}
            </span>
          {/each}
        </dd>
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
      label={m.curve.scrub}
      idle={m.curve.idleShort}
      valuetext={(i) => readings[i].spoken}
      onchange={(i) => (index = i)} />
  </div>
  <div class="curve-axis" aria-hidden="true">
    {#each ticks as t (t.i)}<span class="curve-tick" style:left="{((x(t.i) ?? 0) / W) * 100}%">{t.text}</span>{/each}
    <span class="curve-tick end">24</span>
  </div>
  <!-- A legend only for what is drawn: no empty list when the subscribed power is only stated. -->
  {#if radPath || (kvaShown && kva != null)}
    <ul class="legend">
      {#if radPath}<li><span class="line" style:background={SERIES.radiators}></span>{m.curve.radiators}</li>{/if}
      {#if kvaShown && kva != null}<li><span class="dash"></span>{m.curve.kva(kva)}</li>{/if}
    </ul>
  {/if}
  {#if kva != null && !kvaShown}<p class="muted kva-note">{m.curve.kvaOff(kva, fmtWh(kvaWh))}</p>{/if}
  <div class="visually-hidden"><table>
    <caption>{label}</caption>
    <thead>
      <tr><th scope="col">{m.curve.hour}</th>{#each table.columns as c (c.key)}<th scope="col">{c.label}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each table.rows as r, i (i)}
        <tr><th scope="row">{r.head}</th>{#each r.cells as c, j (j)}<td>{c}</td>{/each}</tr>
      {/each}
    </tbody>
  </table></div>
{/if}

<style>
  /* Fields flow at their day's width (above), so where a row wraps depends on the day and the width only. */
  .readout {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    margin: 0 0 10px;
    font-size: 12px;
  }
  .when {
    flex: 1 0 100%;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .when dd {
    min-height: 1lh;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The keyboard hint, where one line has room for it. */
  .wide {
    display: none;
  }
  @media (min-width: 1024px) {
    .wide {
      display: inline;
    }
  }
  /* A field is as wide as its widest text of the day, capped at the row (a long reason then wraps, in every variant). */
  .field {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
  }
  .field dt {
    white-space: nowrap;
    color: var(--mu);
  }
  dd {
    margin: 0;
  }
  .field dd {
    display: grid;
    font-size: 13px;
  }
  /* Every text of the day in the same cell; only the current one is seen. */
  .v {
    grid-area: 1 / 1;
    min-width: 0;
    visibility: hidden;
  }
  .v.cur {
    visibility: visible;
  }
  .val {
    display: block;
    white-space: nowrap;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  /* Why a field reads « — » (e.g. « 2 sur 3 radiateurs mesurés »). */
  .why {
    display: block;
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
