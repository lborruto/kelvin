<script lang="ts">
  import { untrack } from 'svelte';
  import { scaleLinear } from 'd3-scale';
  import { curveMonotoneX, curveStepAfter, line } from 'd3-shape';
  import { runText } from '$lib/activity';
  import type { Override, RoomActivity, RoomMode, WeekProgram } from '$lib/api/types';
  import { CARD_W, guideCard } from '$lib/chart';
  import { fmtTemp, fmtTempTick, fmtTime } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { m } from '$lib/i18n';
  import { inspectionTable } from '$lib/inspector';
  import { desktop } from '$lib/media.svelte';
  import { comfortBands } from '$lib/program';
  import {
    inspectMoment, MOMENT_ORDER, momentProvenance, outdoorDomain, pointAt, slots, yRange, type MomentCtx, type OutdoorPoint, type RangeKind
  } from '$lib/roomchart';
  import { announcer } from '$lib/stores/announcer.svelte';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import ChartInspector from './ChartInspector.svelte';
  import Scrubber from './Scrubber.svelte';

  interface Props {
    points: StripPoint[];
    start: number;
    end: number;
    now: number;
    program?: WeekProgram;
    mode?: RoomMode | null;
    comfort?: number | null;
    eco?: number | null;
    target?: number | null;
    pendingTarget?: number | null;
    /** A comfort setpoint sent but not yet confirmed: the rest of today's programme is redrawn dashed at it. */
    pendingComfort?: number | null;
    /** A 00 · 06 · 12 · 18 · 24 time row with the current time at the now marker (day ranges only). */
    axis?: boolean;
    height?: number;
    label: string;
    /** Window-open and presence runs the radiators reported (QW4). */
    activity?: RoomActivity | null;
    /** Draw those runs (the room panel's chart, which has a legend). Cards leave them out and draw the setpoint dashed. */
    events?: boolean;
    /** The room panel's chart: a scale fitted to what it draws (±1 °C, ticks every 1 or 2 °C) labelled in a left
     *  gutter with faint grid lines. Without it (cards), the domain holds 15–23 °C and every known value. */
    yAxis?: boolean;
    /** Make the chart readable moment by moment (hover, tap or drag, ←/→): a guide line and the inspector. */
    inspect?: {
      kind: RangeKind;
      stepMs: number;
      /** Radiator id → name; each gets its own row when `several`. */
      names: Record<string, string>;
      several: boolean;
      override?: Override | null;
      presence?: boolean;
      window?: boolean;
    } | null;
    /** Plan 14: past hourly outdoor temperatures (epoch ms, °C), drawn as a dashed `--outdoor` line up to now on the
     *  same °C scale (`outdoorDomain`: within 5 °C of the room's values; beyond, the line is clipped at the edge). */
    outdoor?: OutdoorPoint[];
  }
  let {
    points, start, end, now, program = {}, mode = null, comfort = null, eco = null,
    target = null, pendingTarget = null, pendingComfort = null, axis = false, height = 36, label, activity = null,
    events = false, yAxis = false, inspect = null, outdoor = []
  }: Props = $props();

  const W = 300;
  /** The presence lane's height, along the bottom of the plot. */
  const PRESENCE_H = 4;
  /** How long a just-answered pending path stays on screen, morphing to solid when confirmed. */
  const SETTLE_MS = 250;
  const uid = `ts${Math.random().toString(36).slice(2, 9)}`;

  // A pending value that just went away is held briefly: if the radiator now reports it, it was confirmed.
  type Held = { kind: 'target' | 'comfort'; v: number };
  let held = $state<Held | null>(null);
  let last: Held | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (held = null), SETTLE_MS);
  };
  $effect(() => {
    const cur: Held | null =
      pendingTarget != null ? { kind: 'target', v: pendingTarget } : pendingComfort != null ? { kind: 'comfort', v: pendingComfort } : null;
    untrack(() => {
      if (cur) {
        clearTimeout(settleTimer);
        held = null;
      } else if (last) {
        held = last;
        settle();
      }
      last = cur;
    });
  });
  let confirmed = $derived(held != null && (held.kind === 'target' ? target : comfort) === held.v);
  // Restart the window when the confirmation lands, so the morph always plays in full.
  $effect(() => {
    if (confirmed) untrack(settle);
  });
  $effect(() => () => clearTimeout(settleTimer));

  let shownTarget = $derived(pendingTarget ?? (held?.kind === 'target' ? held.v : null));
  let shownComfort = $derived(pendingComfort ?? (held?.kind === 'comfort' ? held.v : null));

  let x = $derived(scaleLinear().domain([start, end]).range([0, W]));
  // The outdoor hours already past (never a forecast on a history chart).
  let outdoorPts = $derived(outdoor.filter((p) => p.t >= start && p.t <= Math.min(end, now)));
  let known = $derived(
    [...points.flatMap((p) => [p.v, p.s]), comfort, eco, target, shownTarget, shownComfort].filter(
      (v): v is number => v != null && !Number.isNaN(v)
    )
  );
  // The room panel's scale: the temperatures read so far (the room's and each radiator's) and the setpoints drawn,
  // never the recorded setpoints (a radiator off may report 0 °C). It moves only with the data, never with the
  // inspected moment.
  let drawn = $derived(
    [
      ...points.filter((p) => p.t <= now).flatMap((p) => [p.v, ...(p.rads ?? []).map((r) => r.v)]),
      ...(mode === 'manual' ? [target] : mode === 'program' ? [comfort, eco] : []),
      shownTarget,
      ...(mode === 'program' && shownComfort != null && eco != null ? [shownComfort, eco + (shownComfort - (comfort ?? shownComfort))] : [])
    ].filter((v): v is number => v != null && !Number.isNaN(v))
  );
  // The outdoor line joins the scale, clamped near the room's values (one scale, the room still readable); with it,
  // up to 6 tick intervals keep the 2 °C step on a 12 °C span.
  let outdoorReach = $derived(outdoorDomain(yAxis ? drawn : known, outdoorPts.map((p) => p.v)));
  let scale = $derived(yAxis ? yRange([...drawn, ...outdoorReach], 1, outdoorReach.length ? 6 : 5) : null);
  let y = $derived(
    scaleLinear()
      .domain(
        scale
          ? [scale.lo, scale.hi]
          : [Math.min(15, ...known, ...outdoorReach) - 0.5, Math.max(23, ...known, ...outdoorReach) + 0.5]
      )
      .range([height - 2, 2])
  );
  let bands = $derived(mode === 'program' ? comfortBands(program, start, end) : []);
  let long = $derived(end - start > 86_400_000 + 3_600_000);
  const clip = (r: { start: number; end: number }) => ({
    a: Math.max(start, r.start * 1000),
    b: Math.min(end, r.end * 1000)
  });
  let windowRuns = $derived((events ? (activity?.window ?? []) : []).map((r) => ({ r, ...clip(r) })).filter((x) => x.b > x.a));
  let presenceRuns = $derived((events ? (activity?.presence ?? []) : []).map((r) => ({ r, ...clip(r) })).filter((x) => x.b > x.a));

  let tempPath = $derived(
    line<StripPoint>()
      .defined((p) => p.v != null)
      .x((p) => x(p.t))
      .y((p) => y(p.v as number))
      .curve(curveMonotoneX)(points.filter((p) => p.t <= now)) ?? ''
  );

  // A gap over 2 h breaks the outdoor line (a missing hour is absent, never bridged across a long stretch).
  let outdoorPath = $derived.by(() => {
    if (outdoorPts.length < 2) return null;
    const withBreaks: { t: number; v: number | null }[] = [];
    for (const [i, p] of outdoorPts.entries()) {
      if (i && p.t - outdoorPts[i - 1].t > 2 * 3_600_000) withBreaks.push({ t: p.t, v: null });
      withBreaks.push(p);
    }
    return (
      line<{ t: number; v: number | null }>()
        .defined((p) => p.v != null)
        .x((p) => x(p.t))
        .y((p) => y(p.v as number))
        .curve(curveMonotoneX)(withBreaks) ?? null
    );
  });

  const step = $derived(line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1])).curve(curveStepAfter));
  function programPath(c: number, e: number): string {
    const pts: [number, number][] = [[start, e]];
    for (const b of bands) pts.push([b.start, c], [b.end, e]);
    pts.push([end, pts[pts.length - 1][1]]);
    return step(pts) ?? '';
  }

  let setpointPath = $derived.by(() => {
    if (mode === 'manual' && target != null) return step([[start, target], [end, target]]) ?? '';
    if (mode === 'program' && comfort != null && eco != null) return programPath(comfort, eco);
    return '';
  });

  let pendingPath = $derived(
    shownTarget != null
      ? (line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]))([[now, shownTarget], [end, shownTarget]]) ?? '')
      : ''
  );
  // Eco follows comfort (same lowering), so the pending programme shifts both.
  let pendingComfortPath = $derived(
    mode === 'program' && shownComfort != null && eco != null
      ? programPath(shownComfort, eco + (shownComfort - (comfort ?? shownComfort)))
      : ''
  );
  let nowX = $derived(Math.max(0, Math.min(W, x(now))));

  // The chart in words (DESIGN: every chart has a text equivalent): range, latest reading, plan.
  let summary = $derived.by(() => {
    const vs = points.filter((p) => p.t <= now && p.v != null).map((p) => p.v as number);
    const parts = vs.length
      ? [m.strip.range(fmtTemp(Math.min(...vs)), fmtTemp(Math.max(...vs))), m.strip.last(fmtTemp(vs.at(-1)))]
      : [m.strip.none];
    if (mode === 'manual' && target != null) parts.push(m.strip.setpoint(fmtTemp(target)));
    else if (mode === 'program' && comfort != null && eco != null) parts.push(m.strip.program(fmtTemp(comfort), fmtTemp(eco)));
    if (shownTarget != null) parts.push(m.strip.pendingSetpoint(fmtTemp(shownTarget)));
    else if (shownComfort != null) parts.push(m.strip.pendingComfort(fmtTemp(shownComfort)));
    if (windowRuns.length) parts.push(m.strip.windowCount(windowRuns.length));
    if (presenceRuns.length) parts.push(m.strip.presenceCount(presenceRuns.length));
    if (outdoorPts.length) {
      const vs = outdoorPts.map((p) => p.v);
      parts.push(m.strip.outdoorRange(fmtTemp(Math.min(...vs)), fmtTemp(Math.max(...vs))));
    }
    return m.strip.summary(parts);
  });

  // Every tick of the fitted scale: a label in the gutter and a faint grid line.
  let yTicks = $derived((scale?.ticks ?? []).map((v) => ({ v, at: y(v) })));
  // Recording started after the range began (a fresh install, a restart): say from when, not an empty box.
  let firstAt = $derived(points.find((p) => p.v != null)?.t ?? null);
  let sparseSince = $derived(yAxis && firstAt != null && firstAt - start > 3_600_000 ? firstAt : null);

  // ---- The inspector: a moment chosen by hover, tap or drag, or ←/→ (DESIGN « Room chart inspector »). ----
  let pw = $state(0);
  let index = $state<number | null>(null);
  let moments = $derived(inspect ? slots(start, end, inspect.stepMs) : []);
  let centers = $derived(moments.map((t) => x(Math.max(start, t))));
  let ctx = $derived<MomentCtx | null>(
    inspect
      ? { ...inspect, now, activity, plan: { mode, program, comfort, eco, target }, outdoor: outdoorPts.length ? outdoorPts : null }
      : null
  );
  // Another range: nothing stays chosen.
  $effect(() => {
    void inspect?.kind;
    untrack(() => (index = null));
  });
  let nowIndex = $derived(Math.max(0, moments.findLastIndex((t) => t <= now)));
  let at = $derived(index == null || !moments.length ? null : Math.min(index, moments.length - 1));
  const read = (i: number) => {
    const t = moments[i];
    const p = pointAt(points, t, inspect!.stepMs);
    return { t, p, ins: inspectMoment(t, p, ctx!) };
  };
  let chosen = $derived(at != null && ctx ? read(at) : null);
  let chosenProv = $derived(chosen && ctx ? momentProvenance(chosen.t, chosen.p, ctx) : null);
  // Measured in px (300 before the first layout, as in tests): the guide and the card are placed in px.
  let plotW = $derived(pw > 0 ? pw : W);
  let guideX = $derived(at != null ? (centers[at] / W) * plotW : null);
  let dotY = $derived(chosen?.p?.v != null && chosen.t <= now ? y(chosen.p.v) : null);
  let sheet = $derived(!desktop.matches);
  // Beside the guide line, else under the plot and its time row: never over the point read.
  let card = $derived(guideX != null ? guideCard(guideX, plotW, height + (axis ? 28 : 8), CARD_W) : null);
  function choose(i: number | null, via?: 'key' | 'hover' | 'press') {
    index = i;
    // A tap or a click does not move focus: the live region says what was chosen. Keys use the slider's text.
    if (i != null && via === 'press' && ctx) announcer.say(read(i).ins.spoken);
  }
  // The visually hidden table: every recorded moment of the range, in the inspector's words and order.
  let table = $derived.by(() => {
    if (!ctx || !inspect) return null;
    const items = points
      .filter((p) => p.t <= now)
      .map((p) => {
        const ins = inspectMoment(p.t, p, ctx!);
        return { head: ins.title, ins };
      });
    const order = [...MOMENT_ORDER.slice(0, 3), ...Object.keys(inspect.names).map((id) => `rad:${id}`), ...MOMENT_ORDER.slice(3)];
    return items.length ? inspectionTable(items, order) : null;
  });

  const HOURS = [0, 6, 12, 18, 24];
  let nowPct = $derived((nowX / W) * 100);
  let nowIn = $derived(now >= start && now <= end);
  let ticks = $derived(
    HOURS.map((h) => ({ h, pct: (h / 24) * 100, label: String(h).padStart(2, '0') })).filter(
      (t) => !nowIn || Math.abs(t.pct - nowPct) >= 9
    )
  );
</script>

<div class="strip" class:gutter={yAxis}>
  {#if yAxis}
    <div class="yaxis" aria-hidden="true" style:height="{height}px">
      {#each yTicks as t (t.v)}<span class="ytick" style:top="{t.at}px">{fmtTempTick(t.v)}°</span>{/each}
    </div>
  {/if}
  {#if sparseSince != null}<p class="since" aria-hidden="true">{m.strip.since(fmtTime(sparseSince))}</p>{/if}
  <div class="plot" bind:clientWidth={pw}>
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label={label} aria-describedby="{uid}d"
    style:height="{height}px">
    <defs>
      <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(25)} y2={y(15)}>
        <stop offset="0" style:stop-color={heatColor(25)} />
        <stop offset="0.5" style:stop-color={heatColor(20)} />
        <stop offset="1" style:stop-color={heatColor(15)} />
      </linearGradient>
      <clipPath id="{uid}f"><rect x={nowX} y="-4" width={W - nowX} height={height + 8} /></clipPath>
      <clipPath id="{uid}o"><rect x="0" y="0" width={W} {height} /></clipPath>
      <pattern id="{uid}h" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" class="hatch" />
      </pattern>
    </defs>
    {#each yTicks as t (t.v)}
      <line class="grid" x1="0" x2={W} y1={t.at} y2={t.at} vector-effect="non-scaling-stroke" />
    {/each}
    {#each presenceRuns as p, i (i)}
      <!-- A thin lane along the bottom, not a full-height wash: presence is context, the Confort band the plan. -->
      <rect class="presence" x={x(p.a)} y={height - PRESENCE_H} width={Math.max(0.5, x(p.b) - x(p.a))} height={PRESENCE_H}><title
          >{runText(p.r, long, 'presence')} · {m.strip.sampled}</title></rect>
    {/each}
    {#each windowRuns as w, i (i)}
      <rect class="window" x={x(w.a)} y="0" width={Math.max(0.5, x(w.b) - x(w.a))} {height} fill="url(#{uid}h)"><title
          >{runText(w.r, long, 'window')} · {m.strip.sampled}</title></rect>
    {/each}
    {#each bands as b, i (i)}
      <rect class="band" x={x(b.start)} y="0" width={Math.max(0.5, x(b.end) - x(b.start))} {height} />
      <line class="band-edge" x1={x(b.start)} x2={x(b.end)} y1="0.5" y2="0.5" vector-effect="non-scaling-stroke" />
    {/each}
    {#if setpointPath}<path class="setpoint" class:quiet={!events} d={setpointPath} vector-effect="non-scaling-stroke" />{/if}
    {#if pendingComfortPath}
      <path class="pending-comfort" class:confirmed={held?.kind === 'comfort' && confirmed} d={pendingComfortPath}
        clip-path="url(#{uid}f)" vector-effect="non-scaling-stroke" />
    {/if}
    {#if pendingPath}
      <path class="pending-target" class:confirmed={held?.kind === 'target' && confirmed} d={pendingPath} vector-effect="non-scaling-stroke" />
    {/if}
    {#if outdoorPath}<path class="outdoor" d={outdoorPath} clip-path="url(#{uid}o)" vector-effect="non-scaling-stroke" />{/if}
    <path class="temp" d={tempPath} stroke="url(#{uid})" vector-effect="non-scaling-stroke" />
    <line class="now" x1={nowX} x2={nowX} y1="0" y2={height} vector-effect="non-scaling-stroke" />
  </svg>
  {#if inspect && moments.length}
    <Scrubber centers={centers} {W} index={at} label={m.roomChart.slider(label)} idle={m.roomChart.idle} start={nowIndex} leave
      toggle={sheet} valuetext={(i) => read(i).ins.spoken} onchange={choose} />
    {#if guideX != null}
      <!-- The moment read: a 1 px ink guide and, where a temperature was read, a dot on the line. -->
      <span class="guide" aria-hidden="true" style:left="{guideX}px" style:height="{height}px"></span>
      {#if dotY != null}<span class="dot" aria-hidden="true" style:left="{guideX}px" style:top="{dotY}px"></span>{/if}
    {/if}
    {#if !sheet && chosen && card}
      <ChartInspector ins={chosen.ins} mode="card" id="{uid}-inspector" left={card.left} top={card.top} provenance={chosenProv} />
    {/if}
  {/if}
  </div>
  <p class="visually-hidden" id="{uid}d">{summary}</p>
  {#if axis}
    <div class="axis" aria-hidden="true">
      {#each ticks as t (t.h)}
        <span class="tick" class:first={t.h === 0} class:last={t.h === 24} style:left="{t.pct}%">{t.label}</span>
      {/each}
      {#if nowIn}<span class="tick now-label" style:left="{Math.min(95, Math.max(5, nowPct))}%">{fmtTime(now)}</span>{/if}
    </div>
  {/if}
  {#if sheet && chosen}
    <!-- Phone: docked under the chart, so nothing above it moves; a second tap or Esc closes it. -->
    <ChartInspector ins={chosen.ins} mode="sheet" id="{uid}-inspector" provenance={chosenProv} onclose={() => (index = null)} />
  {/if}
  {#if table}
    <!-- A table cannot shrink to 1 px: the wrapper hides it without widening or lengthening the page. -->
    <div class="visually-hidden"><table>
      <caption>{label}</caption>
      <thead><tr><th scope="col">{m.roomChart.when}</th>{#each table.columns as c (c.key)}<th scope="col">{c.label}</th>{/each}</tr></thead>
      <tbody>
        {#each table.rows as r, i (i)}
          <tr><th scope="row">{r.head}</th>{#each r.cells as c, j (j)}<td>{c}</td>{/each}</tr>
        {/each}
      </tbody>
    </table></div>
  {/if}
</div>

<style>
  /* Presence: a thin muted lane along the bottom (distinct from the Confort wash by place and shape); window
     open: a hatch (not a heat hue: it is a report, not heat). */
  .presence {
    fill: var(--mu);
    opacity: 0.55;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .plot {
    position: relative;
  }
  .guide {
    position: absolute;
    top: 0;
    width: 1px;
    margin-left: -0.5px;
    background: var(--tx);
    pointer-events: none;
    z-index: 2;
  }
  .dot {
    position: absolute;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background: var(--tx);
    box-shadow: 0 0 0 2px var(--s1);
    pointer-events: none;
    z-index: 2;
  }
  .hatch {
    stroke: var(--mu);
    stroke-width: 1.5;
    opacity: 0.45;
  }
  .strip {
    position: relative;
    min-width: 0;
  }
  /* The room panel's chart: a 28 px gutter for the scale; the time axis below lines up with the plot. */
  .strip.gutter {
    padding-left: 28px;
  }
  .yaxis {
    position: absolute;
    left: 0;
    top: 0;
    width: 24px;
  }
  .ytick {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    font-size: 11px;
    line-height: 14px;
    color: var(--fa);
    font-variant-numeric: tabular-nums;
  }
  .since {
    position: absolute;
    top: 2px;
    left: 34px;
    margin: 0;
    font-size: 11px;
    color: var(--mu);
    pointer-events: none;
  }
  svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
  /* Comfort periods: a warm wash with a firmer top edge, so the plan reads on the card. */
  .band {
    fill: var(--warm);
    opacity: 0.16;
  }
  .band-edge {
    stroke: var(--warm);
    stroke-width: 1;
    opacity: 0.4;
  }
  .setpoint {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1;
    opacity: 0.8;
  }
  /* The target: a muted dashed step (the legend's « Consigne »), quieter still on cards. Pending requests are ink. */
  .setpoint {
    stroke-dasharray: 3 3;
  }
  .setpoint.quiet {
    opacity: 0.7;
  }
  .pending-target,
  .pending-comfort {
    fill: none;
    stroke: var(--tx);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
  }
  .confirmed {
    animation: kv-solidify var(--t-morph) var(--ease-out) forwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .confirmed {
      animation: kv-solidify-rm var(--t-exit) linear forwards;
    }
  }
  /* The outdoor temperature (Plan 14): a thin dashed line in its own colour, under the room's line. */
  .outdoor {
    fill: none;
    stroke: var(--outdoor);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
  }
  .temp {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .now {
    stroke: var(--tx);
    stroke-width: 1;
    opacity: 0.7;
  }
  .axis {
    position: relative;
    height: 16px;
    margin-top: 4px;
    font-size: 11px;
    line-height: 16px;
    color: var(--fa);
    font-variant-numeric: tabular-nums;
  }
  .tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .tick.first {
    transform: none;
  }
  .tick.last {
    transform: translateX(-100%);
  }
  .now-label {
    color: var(--tx);
    font-weight: 600;
  }
</style>
