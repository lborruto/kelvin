<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import Scrubber from './Scrubber.svelte';
  import OutdoorToggle from './OutdoorToggle.svelte';
  import Swatch from './Swatch.svelte';
  import type { EnergyInterval, RoomSample } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtFixed, fmtTemp, fmtTempTick, fmtTime, fmtWh } from '$lib/format';
  import { m } from '$lib/i18n';
  import { inspectionTable, intervalLabel, READOUT_ORDER, readInterval, type Inspection, type Row } from '$lib/inspector';
  import { hourlyLine, linePaths, maxTicks, tempScale, type Pt } from '$lib/outdoorLine';
  import type { OutdoorPoint } from '$lib/roomchart';
  import { outdoorLine } from '$lib/stores/outdoorLine.svelte';

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
    /** The day as a whole (`readDay`): what the readout says when no half-hour is chosen. */
    idle?: Inspection | null;
    /** The plot's height in px (Tableau: taller where the Courbe leads the board). */
    height?: number;
    /** The day's published outdoor hours (epoch ms, °C; empty while they load): the readout's « Dehors » and the
     *  hourly line on its own °C axis. Null without a weather place (no field, no line, no legend key). */
    outdoor?: OutdoorPoint[] | null;
  }
  let {
    intervals, label, split = true, kva = null, samples = null, room = null, index = $bindable(null), idle = null, height = 140,
    outdoor = null
  }: Props = $props();

  let width = $state(0);
  let W = $derived(width > 0 ? width : 600);
  let H = $derived(height);
  let BASE = $derived(H - 1);
  /** The line is drawn (a place, and the owner did not hide it): its °C gutter is held from the first frame. */
  let lineOn = $derived(outdoor != null && outdoorLine.on);
  // Wh labels in the left gutter (ink), °C in the right one (the line's colour).
  let PAD = $derived({ top: 16, left: 40, right: lineOn ? 30 : 0 });
  let x = $derived(scaleBand<number>().domain(intervals.map((_, i) => i)).range([PAD.left, W - PAD.right]).paddingInner(0.15));
  let dataMax = $derived(Math.max(1, ...intervals.map((p) => Math.max(p.wh, p.radiators_wh ?? 0))));
  let kvaWh = $derived(kva != null ? kva * 1000 * 0.5 : null);
  // Drawn only within 2× the data, so a 12 kVA line never flattens a quiet day; otherwise stated.
  let kvaShown = $derived(kvaWh != null && kvaWh <= 2 * dataMax);
  let y = $derived(scaleLinear().domain([0, kvaShown && kvaWh != null ? Math.max(dataMax, kvaWh) : dataMax]).nice().range([BASE, PAD.top]));
  let nTicks = $derived(maxTicks(W));
  let yTicks = $derived(y.ticks(nTicks));
  // The outdoor hours: one point per hour on the half-hour that starts it; a missing hour breaks the line.
  let hours = $derived(lineOn && outdoor ? hourlyLine(intervals, outdoor) : []);
  let tScale = $derived(lineOn ? tempScale(hours.map((h) => h.v), nTicks) : null);
  let tY = $derived(tScale ? scaleLinear().domain([tScale.lo, tScale.hi]).range([BASE, PAD.top]) : null);
  let centers = $derived(intervals.map((_, i) => (x(i) ?? 0) + x.bandwidth() / 2));
  let tPaths = $derived(linePaths(tY ? hours.map((h): Pt | null => (h.v != null ? { x: centers[h.i], y: tY(h.v), kind: 'obs' } : null)) : []));
  let lineSentence = $derived.by(() => {
    const vs = hours.map((h) => h.v).filter((v): v is number => v != null);
    return vs.length ? m.outdoorLine.range(fmtTemp(Math.min(...vs)), fmtTemp(Math.max(...vs))) : null;
  });
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
  /** HC/HP halves are drawn (a tariff splits the day and some half-hour has its off-peak fraction). */
  let hasSplit = $derived(split && intervals.some((p) => p.offpeak != null));
  let ctx = $derived({ intervals, samples, room, tariff: split, outdoor });
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
  let idleRows = $derived(new Map((idle?.rows ?? []).map((r) => [r.key, r])));
  /** The row a field shows: the half-hour's, else the day's (a field with no day value is kept, unseen). */
  const shownRow = (r: Row): Row | null => (current || !idle ? r : (idleRows.get(r.key) ?? null));
  /** « Dehors » may fill in after the day (the hours arrive on their own): its widest texts are held from the start, so
   *  the field never grows under the reader. Never shown (never current). */
  let outdoorSizers = $derived<Inspection | null>(
    outdoor
      ? {
          title: '',
          notes: [],
          empty: null,
          spoken: '',
          rows: [
            { key: 'outdoor', label: '', value: m.energyUi.tempAvg(fmtTemp(-10.5)) },
            { key: 'outdoor', label: '', value: '—', note: m.outdoorLine.noHour }
          ]
        }
      : null
  );
  let variants = $derived.by(() => {
    const byKey = new Map<string, Map<string, Row>>();
    for (const r of [idle ?? readInterval(null, ctx), ...readings, ...(outdoorSizers ? [outdoorSizers] : [])]) {
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
      <dd class="num">{#if current}{readout.title}{:else if idle}{idle.title}{:else}{m.curve.idle}<span class="wide">{m.curve.idleKeys}</span>{/if}</dd>
    </div>
    {#each readout.rows as r (r.key)}
      {@const s = shownRow(r)}
      {@const cur = s ? variantId(s) : null}
      <div class="field" class:off={!s}>
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
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={lineSentence ? `${label}. ${lineSentence}` : label}>
      {#each yTicks as t (t)}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
        <text class="yl" x={PAD.left - 6} y={Math.min(y(t) + 3.5, H - 1)} text-anchor="end">{fmtFixed(t, 0)}</text>
      {/each}
      <text class="unit" x={PAD.left - 6} y="9" text-anchor="end">{m.outdoorLine.unitWh}</text>
      {#if tScale && tY}
        {#each tScale.ticks as t (t)}
          <text class="tl" x={W - PAD.right + 6} y={Math.min(tY(t) + 3.5, H - 1)}>{m.outdoorLine.tick(fmtTempTick(t))}</text>
        {/each}
        <text class="unit t" x={W - PAD.right + 6} y="9">{m.outdoorLine.unitTemp}</text>
      {/if}
      {#each intervals as p, i (p.ts)}
        {@const top = y(p.wh)}
        {@const f = split && p.offpeak != null ? p.offpeak : null}
        {@const cut = f != null ? top + (BASE - top) * (1 - f) : BASE}
        <g style:--i={i}>
          {#if f == null}
            <rect class="all" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, BASE - top)} style:fill={SERIES.home} rx="1" />
          {:else}
            {#if f < 1}
              <!-- 1 px knockout above the HC part, so the two blues never touch. -->
              <rect class="hp" x={x(i)} width={x.bandwidth()} y={top} height={Math.max(0, cut - top - (f > 0 ? 1 : 0))} style:fill={SERIES.hp} rx="1" />
            {/if}
            {#if f > 0}
              <rect class="hc" x={x(i)} width={x.bandwidth()} y={cut} height={Math.max(0, BASE - cut)} style:fill={SERIES.hc} rx="1" />
              <rect class="hc hatch" x={x(i)} width={x.bandwidth()} y={cut} height={Math.max(0, BASE - cut)} fill="url(#hc-hatch)" rx="1" />
            {/if}
          {/if}
        </g>
      {/each}
      {#if kvaShown && kvaWh != null}
        <line class="kva" x1={PAD.left} x2={W - PAD.right} y1={y(kvaWh)} y2={y(kvaWh)} />
      {/if}
      {#if tPaths.solid || tPaths.dots.length}
        <!-- The outdoor hours above the bars on a subtle halo; the radiators' step line comes after, its knockout cutting it. -->
        <g class="temp" aria-hidden="true">
          {#if tPaths.solid}<path class="t-halo" d={tPaths.solid} /><path class="t-line" d={tPaths.solid} />{/if}
          {#each tPaths.dots as p (p.x)}<circle class="t-dot-halo" cx={p.x} cy={p.y} r="4" /><circle class="t-dot" cx={p.x} cy={p.y} r="2.5" />{/each}
        </g>
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
    <span class="curve-tick end" style:right="{PAD.right}px">24</span>
  </div>
  {#if idle}<p class="muted hint">{m.energyUi.scrubHint}</p>{/if}
  <!-- A legend only for what is drawn: no empty list when the subscribed power is only stated. -->
  {#if radPath || (kvaShown && kva != null) || hasSplit || outdoor}
    <ul class="legend">
      {#if hasSplit}
        <li><Swatch series="hc" />{m.energyPage.hc}</li>
        <li><Swatch series="hp" />{m.energyPage.hp}</li>
      {/if}
      {#if radPath}<li><Swatch series="radiators" line />{m.curve.radiators}</li>{/if}
      {#if kvaShown && kva != null}<li><span class="dash"></span>{m.curve.kva(kva)}</li>{/if}
      {#if outdoor}<OutdoorToggle />{/if}
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
  /* A field with no whole-day value (Tarif, Prix) while the day is shown: its box stays, unseen (no reflow). */
  .field.off {
    visibility: hidden;
  }
  .field.off .v.cur {
    visibility: hidden;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 12px;
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
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .yl,
  .tl,
  .unit {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .yl {
    fill: var(--tx);
  }
  .unit {
    font-size: 10px;
    fill: var(--mu);
  }
  .tl,
  .unit.t {
    fill: var(--outdoor);
  }
  /* Not a bar: no growth from the baseline, a fade like the radiators' marks. */
  .temp {
    pointer-events: none;
    transform: none;
    animation: kv-fade-in var(--t-state) ease both;
  }
  @media (prefers-reduced-motion: reduce) {
    .temp {
      animation: none;
    }
  }
  .t-halo {
    fill: none;
    stroke: var(--s1);
    stroke-width: 5;
    stroke-opacity: 0.85;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .t-line {
    fill: none;
    stroke: var(--outdoor);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .t-dot-halo {
    fill: var(--s1);
    opacity: 0.85;
  }
  .t-dot {
    fill: var(--outdoor);
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
