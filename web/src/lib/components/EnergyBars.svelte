<script lang="ts" module>
  /** Show every nth axis label so each keeps at least 44 px; about ten labels until the width is known. */
  export function labelEvery(count: number, width: number): number {
    return Math.max(1, Math.ceil(width > 0 ? (count * 44) / width : count / 10));
  }
</script>

<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import { fmtKwh } from '$lib/format';

  interface Group {
    label: string;
    /** null = no data (never drawn as zero). */
    parts: { key: string; value: number | null }[];
  }
  interface Overlay {
    label: string;
    values: (number | null)[];
    color: string;
  }
  interface Props {
    groups: Group[];
    colors: Record<string, string>;
    unit: string;
    label: string;
    names?: Record<string, string>;
    overlay?: Overlay | null;
  }
  let { groups, colors, unit, label, names = {}, overlay = null }: Props = $props();

  const W = 600;
  const H = 160;
  const PAD = { top: 8, right: 0, bottom: 2, left: 0 };

  let x = $derived(scaleBand<string>().domain(groups.map((g) => g.label)).range([PAD.left, W - PAD.right]).paddingInner(0.25).paddingOuter(0.125));
  let overlayMax = $derived(Math.max(0, ...(overlay?.values ?? []).map((v) => v ?? 0)));
  let max = $derived(Math.max(0.1, overlayMax, ...groups.map((g) => g.parts.reduce((a, p) => a + (p.value ?? 0), 0))));
  let y = $derived(scaleLinear().domain([0, max]).nice().range([H - PAD.bottom, PAD.top]));
  let axisWidth = $state(0);
  let every = $derived(labelEvery(groups.length, axisWidth));
  let keys = $derived([...new Set(groups.flatMap((g) => g.parts.map((p) => p.key)))]);

  function stacks(g: Group) {
    let acc = 0;
    return g.parts.flatMap((p) => {
      if (p.value == null || p.value <= 0) return [];
      const y0 = acc;
      acc += p.value;
      return [{ key: p.key, value: p.value, y0, y1: acc }];
    });
  }
  // An interior bucket with no data (data on both sides) gets a faint baseline tick, so a gap
  // never reads as a zero. Leading and trailing empties stay blank.
  let gaps = $derived.by(() => {
    const missing = groups.map((g) => g.parts.every((p) => p.value == null));
    const first = missing.indexOf(false);
    const last = missing.lastIndexOf(false);
    return groups.filter((_, i) => missing[i] && first >= 0 && i > first && i < last);
  });
  const fmt = (v: number) => (unit === 'kWh' ? fmtKwh(v) : `${v} ${unit}`);
  const valueOf = (g: Group, key: string) => g.parts.find((p) => p.key === key)?.value ?? null;
  const cell = (v: number | null | undefined) => (v == null ? '—' : fmt(v));
</script>

{#if !groups.length}
  <p class="muted empty">Pas encore de données.</p>
{:else}
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={label}>
    {#each y.ticks(4) as t (t)}
      <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
    {/each}
    {#each groups as g (g.label)}
      {#each stacks(g) as s (s.key)}
        <rect class="part" x={x(g.label)} width={x.bandwidth()} y={y(s.y1)} height={Math.max(0, y(s.y0) - y(s.y1))}
          style:fill={colors[s.key] ?? 'var(--mu)'} rx="2">
          <title>{g.label} · {names[s.key] ? `${names[s.key]} ` : ''}{fmt(s.value)}</title>
        </rect>
      {/each}
    {/each}
    {#each gaps as g (g.label)}
      <line class="gap" x1={x(g.label)} x2={(x(g.label) ?? 0) + x.bandwidth()} y1={H - PAD.bottom - 1} y2={H - PAD.bottom - 1}>
        <title>{g.label} · donnée manquante</title>
      </line>
    {/each}
    {#if overlay}
      {#each groups as g, i (g.label)}
        {@const v = overlay.values[i]}
        {#if v != null && v > 0}
          <line class="mark" x1={x(g.label)} x2={(x(g.label) ?? 0) + x.bandwidth()} y1={y(v)} y2={y(v)} style:stroke={overlay.color}>
            <title>{g.label} · {overlay.label} {fmt(v)}</title>
          </line>
        {/if}
      {/each}
    {/if}
  </svg>
  <div class="axis" bind:clientWidth={axisWidth} style:grid-template-columns="repeat({groups.length}, 1fr)" aria-hidden="true">
    {#each groups as g, gi (g.label)}
      <span class="cell">{#if gi % every === 0}<span class="tick">{g.label}</span>{/if}</span>
    {/each}
  </div>
  <table class="visually-hidden">
    <caption>{label}</caption>
    <thead>
      <tr>
        <th scope="col">Période</th>
        {#each keys as k (k)}<th scope="col">{names[k] ?? k}</th>{/each}
        {#if overlay}<th scope="col">{overlay.label}</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each groups as g, i (g.label)}
        <tr>
          <th scope="row">{g.label}</th>
          {#each keys as k (k)}<td>{cell(valueOf(g, k))}</td>{/each}
          {#if overlay}<td>{cell(overlay.values[i])}</td>{/if}
        </tr>
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
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .axis {
    display: grid;
    margin-top: 4px;
  }
  .cell {
    display: flex;
    justify-content: center;
    min-width: 0;
  }
  .tick {
    color: var(--fa);
    font-size: 11px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .gap {
    stroke: var(--fa);
    stroke-width: 2;
    stroke-dasharray: 3 3;
  }
  .mark {
    stroke-width: 2;
    stroke-linecap: round;
  }
  .empty {
    font-size: 13px;
  }
</style>
