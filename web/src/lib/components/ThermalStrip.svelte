<script lang="ts">
  import { untrack } from 'svelte';
  import { scaleLinear } from 'd3-scale';
  import { curveMonotoneX, curveStepAfter, line } from 'd3-shape';
  import type { RoomMode, WeekProgram } from '$lib/api/types';
  import { fmtTime } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { comfortBands } from '$lib/program';
  import type { StripPoint } from '$lib/stores/history.svelte';

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
  }
  let {
    points, start, end, now, program = {}, mode = null, comfort = null, eco = null,
    target = null, pendingTarget = null, pendingComfort = null, axis = false, height = 36, label
  }: Props = $props();

  const W = 300;
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
  let known = $derived(
    [...points.flatMap((p) => [p.v, p.s]), comfort, eco, target, shownTarget, shownComfort].filter(
      (v): v is number => v != null && !Number.isNaN(v)
    )
  );
  let y = $derived(
    scaleLinear()
      .domain([Math.min(15, ...known) - 0.5, Math.max(23, ...known) + 0.5])
      .range([height - 2, 2])
  );
  let bands = $derived(mode === 'program' ? comfortBands(program, start, end) : []);

  let tempPath = $derived(
    line<StripPoint>()
      .defined((p) => p.v != null)
      .x((p) => x(p.t))
      .y((p) => y(p.v as number))
      .curve(curveMonotoneX)(points.filter((p) => p.t <= now)) ?? ''
  );

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

  const HOURS = [0, 6, 12, 18, 24];
  let nowPct = $derived((nowX / W) * 100);
  let nowIn = $derived(now >= start && now <= end);
  let ticks = $derived(
    HOURS.map((h) => ({ h, pct: (h / 24) * 100, label: String(h).padStart(2, '0') })).filter(
      (t) => !nowIn || Math.abs(t.pct - nowPct) >= 9
    )
  );
</script>

<div class="strip">
  <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label={label} style:height="{height}px">
    <defs>
      <linearGradient id={uid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(25)} y2={y(15)}>
        <stop offset="0" style:stop-color={heatColor(25)} />
        <stop offset="0.5" style:stop-color={heatColor(20)} />
        <stop offset="1" style:stop-color={heatColor(15)} />
      </linearGradient>
      <clipPath id="{uid}f"><rect x={nowX} y="-4" width={W - nowX} height={height + 8} /></clipPath>
    </defs>
    {#each bands as b, i (i)}
      <rect class="band" x={x(b.start)} y="0" width={Math.max(0.5, x(b.end) - x(b.start))} {height} />
    {/each}
    {#if setpointPath}<path class="setpoint" d={setpointPath} vector-effect="non-scaling-stroke" />{/if}
    {#if pendingComfortPath}
      <path class="pending-comfort" class:confirmed={held?.kind === 'comfort' && confirmed} d={pendingComfortPath}
        clip-path="url(#{uid}f)" vector-effect="non-scaling-stroke" />
    {/if}
    {#if pendingPath}
      <path class="pending-target" class:confirmed={held?.kind === 'target' && confirmed} d={pendingPath} vector-effect="non-scaling-stroke" />
    {/if}
    <path class="temp" d={tempPath} stroke="url(#{uid})" vector-effect="non-scaling-stroke" />
    <line class="now" x1={nowX} x2={nowX} y1="0" y2={height} vector-effect="non-scaling-stroke" />
  </svg>
  {#if axis}
    <div class="axis" aria-hidden="true">
      {#each ticks as t (t.h)}
        <span class="tick" class:first={t.h === 0} class:last={t.h === 24} style:left="{t.pct}%">{t.label}</span>
      {/each}
      {#if nowIn}<span class="tick now-label" style:left="{Math.min(95, Math.max(5, nowPct))}%">{fmtTime(now)}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .strip {
    min-width: 0;
  }
  svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
  .band {
    fill: var(--warm);
    opacity: 0.1;
  }
  .setpoint {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1;
    opacity: 0.8;
  }
  .pending-target,
  .pending-comfort {
    fill: none;
    stroke: var(--tx);
    stroke-width: 1.25;
    stroke-dasharray: 4 3;
  }
  .confirmed {
    animation: solidify 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes solidify {
    from {
      stroke-dasharray: 4 3;
    }
    to {
      stroke-dasharray: 8 0;
    }
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
