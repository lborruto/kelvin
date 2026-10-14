<script lang="ts" module>
  /** Show every nth axis label so each keeps at least 44 px; about ten labels until the width is known. */
  export function labelEvery(count: number, width: number): number {
    return Math.max(1, Math.ceil(width > 0 ? (count * 44) / width : count / 10));
  }
</script>

<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3-scale';
  import ChartInspector from './ChartInspector.svelte';
  import { cardLeft, nearestIndex, stepIndex, swipeDirection } from '$lib/chart';
  import { fmtKwh } from '$lib/format';
  import { inspectionTable, type Inspection } from '$lib/inspector';
  import { desktop } from '$lib/media.svelte';
  import { announcer } from '$lib/stores/announcer.svelte';

  const COPY = {
    empty: 'Pas encore de données.',
    period: 'Période',
    bars: (label: string) => `Barres du graphique : ${label}`
  } as const;

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
    /** Per group (same order): the inspector, the hidden table row and the bar's spoken name. */
    details?: Inspection[] | null;
    /** The pinned bar (click, tap or keyboard); null when none. */
    selected?: number | null;
    /** Enter on a bar, or the inspector's action. */
    ondrill?: ((i: number) => void) | null;
    drillLabel?: ((i: number) => string | null) | null;
    /** A horizontal swipe on a touch screen: −1 previous period, +1 next. */
    onswipe?: ((dir: -1 | 1) => void) | null;
  }
  let {
    groups,
    colors,
    unit,
    label,
    names = {},
    overlay = null,
    details = null,
    selected = $bindable(null),
    ondrill = null,
    drillLabel = null,
    onswipe = null
  }: Props = $props();

  const uid = $props.id();
  /** Drawn at its measured width, so bars keep their height and corners on a phone. */
  let width = $state(0);
  let W = $derived(width > 0 ? width : 600);
  const H = 160;
  const PAD = { top: 8, right: 0, bottom: 2, left: 0 };

  let x = $derived(scaleBand<string>().domain(groups.map((g) => g.label)).range([PAD.left, W - PAD.right]).paddingInner(0.25).paddingOuter(0.125));
  let overlayMax = $derived(Math.max(0, ...(overlay?.values ?? []).map((v) => v ?? 0)));
  const total = (g: Group) => g.parts.reduce((a, p) => a + (p.value ?? 0), 0);
  let max = $derived(Math.max(0.1, overlayMax, ...groups.map(total)));
  let y = $derived(scaleLinear().domain([0, max]).nice().range([H - PAD.bottom, PAD.top]));
  let axisWidth = $state(0);
  let every = $derived(labelEvery(groups.length, axisWidth));
  let keys = $derived([...new Set(groups.flatMap((g) => g.parts.map((p) => p.key)))]);
  let centers = $derived(groups.map((g) => (x(g.label) ?? 0) + x.bandwidth() / 2));

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
  const fmt = (v: number) => (unit === 'kWh' ? fmtKwh(v) : `${v} ${unit}`);
  const valueOf = (g: Group, key: string) => g.parts.find((p) => p.key === key)?.value ?? null;
  const cell = (v: number | null | undefined) => (v == null ? '—' : fmt(v));

  // ---- Selection (spec §3.2.3): hover shows, click / tap / keyboard pins, Esc clears. ----
  let plot: HTMLDivElement | undefined = $state();
  let buttons: HTMLButtonElement[] = $state([]);
  let hover = $state<number | null>(null);
  /** The roving tab stop; the last bar until the user moves. */
  let focusIdx = $state<number | null>(null);
  let focused = $state(false);
  /** Esc hides the inspector of the focused bar until the next move. */
  let quiet = $state(false);
  let stop = $derived(Math.min(focusIdx ?? groups.length - 1, groups.length - 1));
  let active = $derived(details ? (hover ?? selected ?? (focused && !quiet ? stop : null)) : null);
  let mode = $derived<'card' | 'sheet'>(desktop.matches ? 'card' : 'sheet');
  let table = $derived(details ? inspectionTable(groups.map((g, i) => ({ head: g.label, ins: details[i] }))) : null);

  function plotX(e: PointerEvent): number {
    const r = plot!.getBoundingClientRect();
    return (e.clientX - r.left) * (r.width > 0 ? W / r.width : 1);
  }
  /** The pinned card is inside the plot: the pointer on it stays with it (no re-aim, no unpin), so its action is clickable. */
  const onCard = (e: PointerEvent) => e.target instanceof Element && !!e.target.closest('.inspector');
  let down: { x: number; y: number } | null = null;
  function onpointermove(e: PointerEvent) {
    if (details && e.pointerType === 'mouse' && !onCard(e)) hover = nearestIndex(centers, plotX(e));
  }
  function onpointerleave() {
    hover = null;
  }
  function onpointerdown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY };
  }
  function onpointerup(e: PointerEvent) {
    const d = down;
    down = null;
    if (!details || onCard(e)) return;
    if (d && e.pointerType !== 'mouse' && onswipe) {
      const dir = swipeDirection(e.clientX - d.x, e.clientY - d.y);
      if (dir) {
        onswipe(dir);
        return;
      }
    }
    const i = nearestIndex(centers, plotX(e));
    if (i != null) choose(i);
  }
  /** Pin bar i, or unpin it when it already is (a second tap closes the sheet). */
  function choose(i: number) {
    selected = selected === i ? null : i;
    focusIdx = i;
    quiet = false;
  }
  function onkeydown(e: KeyboardEvent, i: number) {
    if (e.key === 'Escape') {
      if (selected != null || !quiet) {
        e.preventDefault();
        selected = null;
        quiet = true;
      }
      return;
    }
    if (e.key === 'Enter' && ondrill) {
      e.preventDefault();
      ondrill(i);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const n = stepIndex(e.key, i, groups.length);
    if (n == null) return;
    e.preventDefault();
    focusIdx = n;
    selected = n;
    quiet = false;
    buttons[n]?.focus();
    if (details?.[n]) announcer.say(details[n].spoken);
  }
  function actionFor(i: number | null) {
    if (i == null || !ondrill || !drillLabel) return null;
    const l = drillLabel(i);
    return l ? { label: l, run: () => ondrill(i) } : null;
  }
</script>

{#if !groups.length}
  <p class="muted empty">{COPY.empty}</p>
{:else}
  <!-- Pointer selection is a convenience for mouse and touch; the keyboard uses the bar buttons below. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="plot"
    class:interactive={!!details}
    bind:this={plot}
    bind:clientWidth={width}
    {onpointermove}
    {onpointerleave}
    {onpointerdown}
    {onpointerup}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={label}>
      {#each y.ticks(4) as t (t)}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
      {/each}
      {#each groups as g, gi (g.label)}
        {#each stacks(g) as s (s.key)}
          <rect class="part" style:--i={gi} x={x(g.label)} width={x.bandwidth()} y={y(s.y1)} height={Math.max(0, y(s.y0) - y(s.y1))}
            style:fill={colors[s.key] ?? 'var(--mu)'} rx="2" />
        {/each}
      {/each}
      {#each gaps as g (g.label)}
        <line class="gap" x1={x(g.label)} x2={(x(g.label) ?? 0) + x.bandwidth()} y1={H - PAD.bottom - 1} y2={H - PAD.bottom - 1} />
      {/each}
      {#if overlay}
        {#each groups as g, i (g.label)}
          {@const v = overlay.values[i]}
          {#if v != null && v > 0}
            <!-- A knockout under the mark keeps it legible on any bar colour. -->
            <line class="knock" x1={x(g.label)} x2={(x(g.label) ?? 0) + x.bandwidth()} y1={y(v)} y2={y(v)} />
            <line class="mark" x1={x(g.label)} x2={(x(g.label) ?? 0) + x.bandwidth()} y1={y(v)} y2={y(v)} style:stroke={overlay.color} />
          {/if}
        {/each}
      {/if}
      {#if active != null && groups[active]}
        {@const g = groups[active]}
        {@const top = Math.max(total(g), overlay?.values[active] ?? 0)}
        <!-- The selected (or hovered, or focused) bar: a 1 px ink outline; a missing bar outlines its baseline. -->
        <rect class="sel" x={(x(g.label) ?? 0) - 2} width={x.bandwidth() + 4}
          y={top > 0 ? y(top) - 2 : H - PAD.bottom - 6} height={top > 0 ? H - PAD.bottom - y(top) + 4 : 8} rx="3" />
      {/if}
    </svg>
    {#if details}
      <div
        class="keys"
        role="group"
        aria-label={COPY.bars(label)}
        onfocusin={() => (focused = true)}
        onfocusout={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused = false;
        }}>
        {#each groups as g, i (g.label)}
          <button
            bind:this={buttons[i]}
            type="button"
            class="key"
            tabindex={i === stop ? 0 : -1}
            style:left="{((x(g.label) ?? 0) / W) * 100}%"
            style:width="{(x.bandwidth() / W) * 100}%"
            aria-label={details[i]?.spoken ?? g.label}
            aria-pressed={selected === i}
            aria-controls={active === i ? `${uid}-inspector` : undefined}
            onclick={() => choose(i)}
            onkeydown={(e) => onkeydown(e, i)}></button>
        {/each}
      </div>
      {#if mode === 'card' && active != null && details[active]}
        <ChartInspector
          ins={details[active]}
          mode="card"
          id="{uid}-inspector"
          left={cardLeft(x(groups[active].label) ?? 0, x.bandwidth(), W)}
          pinned={selected === active}
          action={actionFor(active)} />
      {/if}
    {/if}
  </div>
  <div class="axis" bind:clientWidth={axisWidth} style:grid-template-columns="repeat({groups.length}, 1fr)" aria-hidden="true">
    {#each groups as g, gi (g.label)}
      <span class="cell">{#if gi % every === 0}<span class="tick">{g.label}</span>{/if}</span>
    {/each}
  </div>
  {#if details && mode === 'sheet' && selected != null && details[selected]}
    <ChartInspector ins={details[selected]} mode="sheet" id="{uid}-inspector" pinned action={actionFor(selected)} />
  {/if}
  <!-- A table cannot shrink to 1 px: the wrapper hides it without widening or lengthening the page. -->
  <div class="visually-hidden"><table>
    <caption>{label}</caption>
    {#if table}
      <thead>
        <tr><th scope="col">{COPY.period}</th>{#each table.columns as c (c.key)}<th scope="col">{c.label}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each table.rows as r, i (i)}
          <tr><th scope="row">{r.head}</th>{#each r.cells as c, j (j)}<td>{c}</td>{/each}</tr>
        {/each}
      </tbody>
    {:else}
      <thead>
        <tr>
          <th scope="col">{COPY.period}</th>
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
    {/if}
  </table></div>
{/if}

<style>
  .plot {
    position: relative;
    min-width: 0;
  }
  /* Vertical scrolling stays with the page; horizontal moves come to the chart (tap, swipe). */
  .plot.interactive {
    touch-action: pan-y;
    cursor: pointer;
  }
  svg {
    display: block;
    max-width: 100%;
    overflow: visible;
  }
  /* Bars grow from the baseline on first draw and on each period change (new keys). */
  .part {
    transform-box: fill-box;
    transform-origin: bottom;
    animation: kv-grow var(--t-data) var(--ease-out) both;
    animation-delay: min(calc(var(--i) * 12ms), 180ms);
  }
  .mark,
  .knock {
    animation: kv-fade-in var(--t-state) ease both;
    animation-delay: 200ms;
  }
  .knock {
    stroke: var(--s1);
    stroke-width: 4;
    stroke-linecap: round;
  }
  @media (prefers-reduced-motion: reduce) {
    .part {
      animation: kv-fade-in var(--t-exit) linear both;
    }
    .mark,
    .knock {
      animation: none;
    }
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  /* The selection outline: ink, 1 px, never animated (it follows the pointer). */
  .sel {
    fill: none;
    stroke: var(--tx);
    stroke-width: 1;
    pointer-events: none;
  }
  /* The keyboard's bar buttons: invisible boxes over each bar, full column height. The pointer
     goes to the plot (nearest bar wins), so these never steal a tap. */
  .keys {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .key {
    position: absolute;
    top: 0;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: none;
    pointer-events: none;
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
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .empty {
    font-size: 13px;
  }
</style>
