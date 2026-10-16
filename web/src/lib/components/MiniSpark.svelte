<!-- The tile's mini sparkline (spec §3 « RoomWidget » / « RoomTile »): today's measured temperature as a 2 px ink
     line drawn up to now (ending in a dot), over the planned setpoint (1.2 px muted, 3/3 dashed) and the comfort
     periods as heat bands at 9 % (programme only). No axis, no ramp colour: the tile's figure carries the value.
     Decorative beside the reading (aria-hidden); the room sheet has the full chart with its table. Points with
     a null value break the line (never drawn as zero). -->
<script lang="ts">
  interface Point {
    /** Epoch ms. */
    t: number;
    v: number | null;
  }
  interface Props {
    points: Point[];
    /** The planned setpoint as steps (epoch ms, °C); none when off. */
    setpoint?: Point[] | null;
    /** Comfort periods (epoch ms). */
    bands?: { from: number; to: number }[];
    start: number;
    end: number;
    now: number;
    height?: number;
    dim?: boolean;
  }
  let { points, setpoint = null, bands = [], start, end, now, height = 50, dim = false }: Props = $props();
  const W = 200;
  let vals = $derived([...points, ...(setpoint ?? [])].map((p) => p.v).filter((v): v is number => v != null));
  let lo = $derived(Math.min(16.5, ...vals) - 0.3);
  let hi = $derived(Math.max(20.5, ...vals) + 0.3);
  const x = (t: number) => ((t - start) / (end - start)) * W;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo)) * (height - 8);
  function path(ps: Point[], step = false): string {
    let d = '';
    let prev: Point | null = null;
    for (const p of ps) {
      if (p.v == null) {
        prev = null;
        continue;
      }
      if (!prev) d += `M${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
      else if (step) d += `L${x(p.t).toFixed(1)} ${y(prev.v!).toFixed(1)}L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
      else d += `L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
      prev = p;
    }
    return d;
  }
  let line = $derived(path(points.filter((p) => p.t <= now)));
  let last = $derived([...points].reverse().find((p) => p.v != null && p.t <= now) ?? null);
</script>

<span class="wrap" class:dim style:height="{height}px" aria-hidden="true">
  <svg class="spark" viewBox="0 0 {W} {height}" preserveAspectRatio="none">
    {#each bands as b, i (i)}<rect x={x(b.from)} y="2" width={Math.max(0, x(b.to) - x(b.from))} height={height - 4} class="band" />{/each}
    {#if setpoint?.length}<path d={path([...setpoint, { t: end, v: setpoint[setpoint.length - 1].v }], true)} class="sp" vector-effect="non-scaling-stroke" />{/if}
    <path d={line} class="t" vector-effect="non-scaling-stroke" />
    <line x1={x(now)} x2={x(now)} y1="2" y2={height - 2} class="now" vector-effect="non-scaling-stroke" />
  </svg>
  {#if last}<span class="dot" style:left="{(x(last.t) / W) * 100}%" style:top="{y(last.v!)}px"></span>{/if}
</span>

<style>
  .wrap {
    position: relative;
    display: block;
    width: 100%;
  }
  .wrap.dim {
    opacity: 0.5;
  }
  .spark {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .band {
    fill: var(--heat);
    fill-opacity: 0.09;
  }
  .sp {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1.2;
    stroke-dasharray: 3 3;
  }
  .t {
    fill: none;
    stroke: var(--tx);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .now {
    stroke: var(--tx);
    stroke-opacity: 0.5;
    stroke-width: 1;
  }
  .dot {
    position: absolute;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background: var(--tx);
  }
</style>
