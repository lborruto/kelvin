<!-- « Météo et coût »'s scatter (Plan 15, spec §7.1, §7.9): each day's outdoor mean against its kWh (or €), the model
     line with its 80 % band, a dashed rule at the balance point. A focus layer reads the dots in temperature order
     (←/→, Home/End, Esc) or under the pointer (nearest dot; a click pins); the ChartInspector shows the day (a card
     on desktop, docked under the chart on a phone), a polite live region says it, and a hidden table lists every
     day. No colour carries meaning alone: the panel's legend names the dot kinds and the band. -->
<script lang="ts">
  import type { LineSample, ModelPoint } from '$lib/api/types';
  import { CARD_W, guideCard } from '$lib/chart';
  import { fmtInt, fmtTemp, fmtTempTick } from '$lib/format';
  import { m } from '$lib/i18n';
  import type { Inspection, Row } from '$lib/inspector';
  import { desktop } from '$lib/media.svelte';
  import { provenance } from '$lib/provenance';
  import { MARGIN, nearest, scatterLayout, type ScatterMode } from '$lib/scatter';
  import { pointRows } from '$lib/weatherCost';
  import ChartInspector from './ChartInspector.svelte';

  interface Props {
    points: ModelPoint[];
    line: LineSample[];
    /** The balance point (°C), drawn as a dashed rule; null while the model is hidden. */
    tb: number | null;
    mode: ScatterMode;
    height: number;
    /** A day chosen from outside (the kit gallery): its date. */
    selected?: string | null;
  }
  let { points, line, tb, mode, height, selected = null }: Props = $props();
  const uid = $props.id();

  let cw = $state(0);
  let w = $derived(cw > 0 ? cw : 600);
  let L = $derived(scatterLayout(points, line, mode, w, height, tb));
  // The day read is kept by its date, so switching kWh ↔ € keeps it when it has a value in both.
  let chosenDate = $state<string | null>(null);
  $effect.pre(() => {
    if (selected != null) chosenDate = selected;
  });
  let pinned = $state(false);
  let spoken = $state('');
  let index = $derived(chosenDate == null ? null : L.dots.findIndex((d) => d.p.date === chosenDate));
  let dot = $derived(index != null && index >= 0 ? L.dots[index] : null);
  let read = $derived(dot ? pointRows(dot.p) : null);
  let ins = $derived<Inspection | null>(
    read ? { title: read.title, rows: read.rows as Row[], notes: [], empty: null, spoken: read.spoken } : null
  );
  let prov = $derived(dot ? provenance('linky-day', { day: dot.p.date }) : null);
  let sheet = $derived(!desktop.matches);
  let card = $derived(dot ? guideCard(dot.cx, w, height + 8, CARD_W) : null);
  let tbX = $derived(tb != null ? Math.round(L.x(tb) * 100) / 100 : null);
  let plotBottom = $derived(height - MARGIN.bottom);

  function choose(i: number | null, say: boolean) {
    const d = i == null ? null : L.dots[i];
    chosenDate = d ? d.p.date : null;
    if (!d) pinned = false;
    if (say) spoken = d ? pointRows(d.p).spoken : '';
  }
  function onkeydown(e: KeyboardEvent) {
    const n = L.dots.length;
    if (e.key === 'Escape') {
      if (chosenDate != null) {
        e.preventDefault();
        e.stopPropagation();
        choose(null, true);
      }
      return;
    }
    if (!n) return;
    const i = index != null && index >= 0 ? index : null;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = i == null ? 0 : Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = i == null ? n - 1 : Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next == null) return;
    e.preventDefault();
    choose(next, true);
  }
  function at(e: PointerEvent): number | null {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const k = r.width > 0 ? w / r.width : 1;
    return nearest(L.dots, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
  }
  function onpointermove(e: PointerEvent) {
    if (!pinned && e.pointerType === 'mouse') choose(at(e), false);
  }
  function onpointerdown(e: PointerEvent) {
    const i = at(e);
    const same = i != null && L.dots[i]?.p.date === chosenDate && pinned;
    pinned = !same && i != null;
    choose(same ? null : i, true);
  }
  function onpointerleave(e: PointerEvent) {
    if (!pinned && e.pointerType === 'mouse') choose(null, false);
  }
  // The hidden table: every day in the inspector's words (its own rows, not the split).
  const COLS = ['outside', 'kwh', 'eur', 'expected', 'excluded'] as const;
  let table = $derived.by(() => {
    const rows = L.dots.map((d) => pointRows(d.p));
    const label = (k: string) => rows.flatMap((r) => r.rows).find((r) => r.key === k)?.label ?? null;
    const cols = COLS.map((k) => ({ k, label: label(k) })).filter((c) => c.label != null);
    return { cols, rows: rows.map((r) => ({ head: r.title, cells: cols.map((c) => r.rows.find((x) => x.key === c.k)?.value ?? '—') })) };
  });
</script>

<figure class="scatter" role="group" aria-label={m.weatherCost.chartLabel}>
  <div class="plot" bind:clientWidth={cw} style:height="{height}px">
    <svg viewBox="0 0 {w} {height}" width={w} {height} aria-hidden="true">
      {#each L.ticksY as t (t.v)}
        <line class="grid" x1={MARGIN.left} x2={w - MARGIN.right} y1={t.at} y2={t.at} />
        <text class="tick" x={MARGIN.left - 6} y={t.at} text-anchor="end" dominant-baseline="middle">{fmtInt(t.v)}</text>
      {/each}
      {#each L.ticksX as t (t.v)}
        <text class="tick" x={t.at} y={plotBottom + 14} text-anchor="middle">{fmtTempTick(t.v)}</text>
      {/each}
      <text class="unit" x={MARGIN.left - 6} y="0" text-anchor="end" dominant-baseline="hanging"
        >{mode === 'kwh' ? m.weatherCost.unitKwh : m.weatherCost.unitEur}</text>
      {#if L.band}<path class="band" d={L.band} />{/if}
      {#if L.path}<path class="model" d={L.path} />{/if}
      {#if tbX != null}
        <line class="tb" x1={tbX} x2={tbX} y1={MARGIN.top} y2={plotBottom} />
        <text class="tb-label" x={tbX + 4} y={MARGIN.top + 2} dominant-baseline="hanging">{m.weatherCost.equilibrium(fmtTemp(tb))}</text>
      {/if}
      {#each L.dots as d (d.p.date)}
        {#if d.kind === 'used'}<circle class="dot used" cx={d.cx} cy={d.cy} r="3" />{/if}
      {/each}
      {#each L.dots as d (d.p.date)}
        {#if d.kind === 'excluded'}<circle class="dot excluded" cx={d.cx} cy={d.cy} r="3" />{/if}
      {/each}
      {#each L.dots as d (d.p.date)}
        {#if d.kind === 'period'}<circle class="dot period" cx={d.cx} cy={d.cy} r="4" />{/if}
      {/each}
      {#if dot}<circle class="ring" cx={dot.cx} cy={dot.cy} r="7" />{/if}
    </svg>
    <button type="button" class="hit" aria-label={m.weatherCost.browse} aria-describedby="{uid}-hint"
      aria-controls={ins ? `${uid}-inspector` : undefined}
      {onkeydown} {onpointermove} {onpointerdown} {onpointerleave}></button>
    {#if ins && !sheet && card}
      <ChartInspector {ins} mode="card" id="{uid}-inspector" left={card.left} top={card.top} {pinned} provenance={prov} />
    {/if}
  </div>
  <p class="axis-x" aria-hidden="true">{m.weatherCost.axisX}</p>
  <p class="hint" id="{uid}-hint">{m.weatherCost.hint}</p>
  <span class="visually-hidden" aria-live="polite">{spoken}</span>
  {#if ins && sheet}
    <ChartInspector {ins} mode="sheet" id="{uid}-inspector" provenance={prov} onclose={() => choose(null, true)} />
  {/if}
  <!-- A table cannot shrink to 1 px: the wrapper hides it without widening or lengthening the page. -->
  <div class="visually-hidden"><table>
    <caption>{m.weatherCost.chartLabel}</caption>
    <thead><tr><th scope="col">{m.weatherCost.rowDate}</th>{#each table.cols as c (c.k)}<th scope="col">{c.label}</th>{/each}</tr></thead>
    <tbody>
      {#each table.rows as r, i (i)}
        <tr><th scope="row">{r.head}</th>{#each r.cells as c, j (j)}<td>{c}</td>{/each}</tr>
      {/each}
    </tbody>
  </table></div>
</figure>

<style>
  .scatter {
    margin: 0;
    min-width: 0;
    position: relative;
  }
  .plot {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .tick,
  .unit,
  .tb-label {
    font-size: 11px;
    fill: var(--fa);
    font-variant-numeric: tabular-nums;
  }
  .tb-label {
    fill: var(--mu);
  }
  /* The model: ink line, its 80 % band ink at 10 %; never a heat colour (it is not « heating on »). */
  .band {
    fill: var(--tx);
    opacity: 0.1;
  }
  .model {
    fill: none;
    stroke: var(--tx);
    stroke-width: 1.5;
  }
  .tb {
    stroke: var(--mu);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .dot.used {
    fill: var(--mu);
  }
  .dot.period {
    fill: var(--tx);
  }
  .dot.excluded {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
  .ring {
    fill: none;
    stroke: var(--tx);
    stroke-width: 2;
  }
  /* The focus layer over the whole plot: transparent, crosshair, the focus ring on the plot's edge. */
  .hit {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
    touch-action: pan-y;
    border-radius: 4px;
    z-index: 1;
  }
  .axis-x,
  .hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--mu);
    text-align: center;
  }
  .hint {
    text-align: left;
    color: var(--fa);
  }
</style>
