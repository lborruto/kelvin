<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import Scrubber from './Scrubber.svelte';
  import type { EnergyInterval, RoomSample } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtTemp, fmtTime, fmtWh } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { locale, m } from '$lib/i18n';
  import { intervalLabel, roomInterval } from '$lib/inspector';

  interface Props {
    intervals: EnergyInterval[];
    roomId: string;
    samples: RoomSample[];
    label: string;
    /** The half-hour shared with the Courbe's scrubber. */
    index?: number | null;
  }
  let { intervals, roomId, samples, label, index = $bindable(null) }: Props = $props();
  const uid = $props.id();
  const heat = `linear-gradient(90deg, ${heatColor(15)}, ${heatColor(20)}, ${heatColor(25)})`;

  let width = $state(0);
  let W = $derived(width > 0 ? width : 600);
  const H = 150;
  const TOP = 8;
  const BASE = H - 1;
  /** Gutters for the Wh axis (left) and the °C axis (right). */
  const AXIS = 34;
  let whole = $derived(new Intl.NumberFormat(locale.intl, { maximumFractionDigits: 0 }));
  let x = $derived(scaleBand<number>().domain(intervals.map((_, i) => i)).range([AXIS, W - AXIS]).paddingInner(0.15));

  /** One field of the readout: its value and, when it reads « — », why. */
  type Cell = { value: string; why: string | null };
  const cellText = (c: Cell) => (c.why ? m.roomDay.withWhy(c.why) : c.value);
  const temp = (v: number | null): Cell => ({ value: fmtTemp(v), why: v == null ? m.roomDay.fewSamples : null });
  // A room absent from `by_room` had no radiator recording then; null: one of its radiators has no figure.
  let rows = $derived(
    intervals.map((iv) => {
      const has = roomId in iv.by_room;
      const wh = has ? iv.by_room[roomId] : null;
      const t = roomInterval(samples, iv.ts, iv.minutes);
      return {
        wh,
        temperature: t.temperature,
        setpoint: t.setpoint,
        cells: {
          radiators: { value: fmtWh(wh), why: wh != null ? null : has ? m.roomDay.unknown : m.roomDay.absent },
          temperature: temp(t.temperature),
          setpoint: temp(t.setpoint)
        } as Record<'radiators' | 'temperature' | 'setpoint', Cell>
      };
    })
  );
  let measured = $derived(rows.some((r) => r.wh != null || r.temperature != null));
  let yW = $derived(scaleLinear().domain([0, Math.max(1, ...rows.map((r) => r.wh ?? 0))]).nice().range([BASE, TOP]));
  // The °C axis spans at least 4 °C around the day's readings, so a steady room does not look stormy.
  let tDomain = $derived.by(() => {
    const v = rows.flatMap((r) => [r.temperature, r.setpoint]).filter((t): t is number => t != null);
    if (!v.length) return [16, 22];
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const half = Math.max(2, (hi - lo) / 2 + 0.5);
    return [(lo + hi) / 2 - half, (lo + hi) / 2 + half];
  });
  let yT = $derived(scaleLinear().domain(tDomain).nice().range([BASE, TOP]));
  let centers = $derived(intervals.map((_, i) => (x(i) ?? 0) + x.bandwidth() / 2));
  /** The temperature through the interval centres; a missing value breaks the line. A run of one half-hour is a dot
   * (a lone `M` draws nothing). */
  let temps = $derived.by(() => {
    let d = '';
    const dots: { i: number; t: number }[] = [];
    rows.forEach((r, i) => {
      if (r.temperature == null) return;
      const before = rows[i - 1]?.temperature != null;
      const after = rows[i + 1]?.temperature != null;
      if (!before && !after) return void dots.push({ i, t: r.temperature });
      d += `${before ? 'L' : 'M'}${centers[i]},${yT(r.temperature)}`;
    });
    return { d, dots };
  });
  /** The setpoint as a step line across each half-hour; a missing value breaks it. */
  let setPath = $derived.by(() => {
    let d = '';
    let open = false;
    rows.forEach((r, i) => {
      if (r.setpoint == null) return void (open = false);
      const x0 = x(i) ?? 0;
      // The last step ends at the plot's edge, never in the °C gutter.
      d += `${open ? 'L' : 'M'}${x0},${yT(r.setpoint)}H${Math.min(x0 + x.step(), W - AXIS)}`;
      open = true;
    });
    return d;
  });
  // Axis: 00, 06, 12, 18 on the matching half-hours (DST days stay true), then 24.
  let ticks = $derived(
    intervals.flatMap((p, i) => {
      const t = fmtTime(p.ts * 1000);
      return t.endsWith(':00') && Number(t.slice(0, 2)) % 6 === 0 ? [{ i, text: t.slice(0, 2) }] : [];
    })
  );
  let current = $derived(index != null && intervals[index] ? index : null);
  const said = (i: number) => {
    const c = rows[i].cells;
    return m.roomDay.spoken(intervalLabel(intervals[i], intervals), cellText(c.radiators), cellText(c.temperature), cellText(c.setpoint));
  };

  let FIELDS = $derived([
    { key: 'radiators', label: m.roomDay.radiators },
    { key: 'temperature', label: m.roomDay.temperature },
    { key: 'setpoint', label: m.roomDay.setpoint }
  ] as const);
  const IDLE: Cell = { value: '—', why: null };
  const cellId = (c: Cell) => `${c.value}\u0001${c.why ?? ''}`;
  /**
   * Every text each field takes over the day (idle included), laid out in one grid cell with only the current one
   * visible: a field's size depends on the day only, so scrubbing never reflows the row (as the Courbe's readout, R2).
   */
  let variants = $derived.by(() =>
    FIELDS.map((f) => {
      const seen = new Map<string, Cell>([[cellId(IDLE), IDLE]]);
      for (const r of rows) seen.set(cellId(r.cells[f.key]), r.cells[f.key]);
      return seen;
    })
  );
</script>

{#if !intervals.length || !measured}
  <p class="muted empty">{m.roomDay.empty}</p>
{:else}
  <dl class="readout">
    <div class="when">
      <dt class="visually-hidden">{m.roomDay.hour}</dt>
      <dd class="num">{#if current != null}{intervalLabel(intervals[current], intervals)}{:else}{m.roomDay.idle}<span class="wide">{m.roomDay.idleKeys}</span>{/if}</dd>
    </div>
    {#each FIELDS as f, k (f.key)}
      {@const cur = cellId(current != null ? rows[current].cells[f.key] : IDLE)}
      <div class="field">
        <dt>{f.label}</dt>
        <dd class="num">
          {#each variants[k] as [id, v] (id)}
            <span class="v" class:cur={id === cur} aria-hidden={id === cur ? undefined : 'true'}>
              <span class="val">{v.value}</span>{#if v.why}<span class="why">{v.why}</span>{/if}
            </span>
          {/each}
        </dd>
      </div>
    {/each}
  </dl>
  <div class="units" aria-hidden="true"><span>{m.roomDay.wh}</span><span>{m.roomDay.degrees}</span></div>
  <div class="plot" bind:clientWidth={width}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
      <defs>
        <linearGradient id="{uid}-heat" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={yT(25)} y2={yT(15)}>
          <stop offset="0" style:stop-color={heatColor(25)} />
          <stop offset="0.5" style:stop-color={heatColor(20)} />
          <stop offset="1" style:stop-color={heatColor(15)} />
        </linearGradient>
      </defs>
      {#each yW.ticks(3) as t (t)}
        <text class="tick-w" x={AXIS - 6} y={yW(t)} dy="0.32em">{whole.format(t)}</text>
      {/each}
      {#each yT.ticks(3) as t (t)}
        <text class="tick-t" x={W - AXIS + 6} y={yT(t)} dy="0.32em">{whole.format(t)}</text>
      {/each}
      {#each rows as r, i (intervals[i].ts)}
        {#if r.wh != null && r.wh > 0}
          <rect class="bar" x={x(i)} width={x.bandwidth()} y={yW(r.wh)} height={Math.max(0, BASE - yW(r.wh))} style:fill={SERIES.radiators} rx="1" />
        {/if}
      {/each}
      {#if setPath}<path class="set" d={setPath} />{/if}
      {#if temps.d}<path class="temp" d={temps.d} stroke="url(#{uid}-heat)" />{/if}
      {#each temps.dots as p (p.i)}<circle class="temp-dot" cx={centers[p.i]} cy={yT(p.t)} r="2.5" style:fill={heatColor(p.t)} />{/each}
      {#if current != null}<line class="cross" x1={centers[current]} x2={centers[current]} y1="0" y2={H} />{/if}
    </svg>
    <Scrubber {centers} {W} index={current} label={m.roomDay.scrub} idle={m.roomDay.idleShort} valuetext={said} onchange={(i) => (index = i)} />
  </div>
  <div class="room-axis" aria-hidden="true">
    {#each ticks as t (t.i)}<span class="tick" style:left="{((x(t.i) ?? 0) / W) * 100}%">{t.text}</span>{/each}
    <span class="tick" style:left="{((W - AXIS) / W) * 100}%">24</span>
  </div>
  <!-- Only with something measured: an empty day has nothing for a legend to name. -->
  <ul class="legend">
    <li><span class="swatch" style:background={SERIES.radiators}></span>{m.roomDay.radiatorsCol}</li>
    <li><span class="line" style:background={heat}></span>{m.roomDay.temperature}</li>
    <li><span class="line set"></span>{m.roomDay.setpoint}</li>
  </ul>
  <div class="visually-hidden"><table>
    <caption>{label}</caption>
    <thead>
      <tr><th scope="col">{m.roomDay.hour}</th><th scope="col">{m.roomDay.radiatorsCol}</th><th scope="col">{m.roomDay.temperature}</th><th scope="col">{m.roomDay.setpoint}</th></tr>
    </thead>
    <tbody>
      {#each rows as r, i (intervals[i].ts)}
        <tr>
          <th scope="row">{intervalLabel(intervals[i], intervals)}</th>
          <td>{cellText(r.cells.radiators)}</td><td>{cellText(r.cells.temperature)}</td><td>{cellText(r.cells.setpoint)}</td>
        </tr>
      {/each}
    </tbody>
  </table></div>
{/if}

<style>
  /* The Courbe's readout row, field for field: sized by the day's texts, so scrubbing never reflows it. */
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
  .wide {
    display: none;
  }
  @media (min-width: 1024px) {
    .wide {
      display: inline;
    }
  }
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
  .why {
    display: block;
    font-size: 11px;
    color: var(--mu);
  }
  .units {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--fa);
    margin-bottom: 2px;
  }
  .plot {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
    max-width: 100%;
    overflow: visible;
  }
  .tick-w,
  .tick-t {
    font-size: 11px;
    fill: var(--fa);
    font-variant-numeric: tabular-nums;
  }
  .tick-w {
    text-anchor: end;
  }
  /* The room's radiators, light so the temperature reads over them. */
  .bar {
    opacity: 0.55;
  }
  .temp {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .set {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1;
  }
  /* The crosshair and the lines are drawn, never animated: they follow the pointer. */
  .cross {
    stroke: var(--tx);
    stroke-width: 1;
    pointer-events: none;
  }
  .room-axis {
    position: relative;
    height: 16px;
    margin-top: 4px;
  }
  .tick {
    position: absolute;
    color: var(--fa);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    font-size: 13px;
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
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    opacity: 0.55;
  }
  .line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }
  .line.set {
    height: 1px;
    background: var(--mu);
  }
</style>
