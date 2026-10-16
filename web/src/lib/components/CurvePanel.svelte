<script lang="ts">
  import CurveChart from './CurveChart.svelte';
  import Disclosure from './Disclosure.svelte';
  import Icon from './Icon.svelte';
  import type { EnergyDay } from '$lib/api/types';
  import { halfHoursIn, type View } from '$lib/energy';
  import { fmtDateLong, fmtKwhExact, fmtPct1, matchParts } from '$lib/format';
  import { m } from '$lib/i18n';
  import { readDay, type Inspection } from '$lib/inspector';
  import { roomName } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import { ANCHORS } from '$lib/paths';

  interface Props {
    dayIso: string;
    day: EnergyDay | null;
    error: string | null;
    view: View;
    /** A tariff exists: HC/HP split and prices. */
    split: boolean;
    canPrev: boolean;
    canNext: boolean;
    onstep: (d: -1 | 1) => void;
    onretry: () => void;
    curveSince: string | null;
    /** Linky's daily quota is spent: a missing curve may come tomorrow. */
    quota: boolean;
    index?: number | null;
    /** The day's bar inspection (Jour, Semaine, Mois): the idle readout reads the bar's own figures. */
    bar?: Inspection | null;
    /** Mois and Année: the panel is its summary line, the curve one « Voir la courbe » away (`detail`). */
    collapsible?: boolean;
    open?: boolean;
  }
  let {
    dayIso, day, error, view, split, canPrev, canNext, onstep, onretry, curveSince, quota, index = $bindable(null), bar = null,
    collapsible = false, open = $bindable(false)
  }: Props = $props();

  // Never another day's bars under this heading.
  let shown = $derived(day && day.date === dayIso ? day : null);
  // A day before the report's first counted day has no figure at all (`not_counted`), whatever Linky holds.
  let why = $derived(
    shown?.not_counted === 'before_first_day' && shown.counted_from
      ? m.curvePanel.beforeCounted(fmtDateLong(shown.counted_from))
      : curveSince && dayIso < curveSince
        ? m.curvePanel.beforeHistory(fmtDateLong(curveSince))
        : quota
          ? m.curvePanel.quota
          : null
  );
  let roomLabel = $derived(shown?.room ? roomName(house.room(shown.room.id) ?? shown.room) : null);
  // The readout at rest: the whole day, from the day bar's own figures.
  let idle = $derived(
    shown && shown.points > 0
      ? readDay(shown, bar, { intervals: shown.intervals, samples: shown.room?.samples ?? null, room: roomLabel, tariff: split })
      : null
  );
  // The collapsed panel's line: « 29,07 kWh · 8,17 € · pointe 5,53 kW à 06:30 ».
  let summary = $derived(
    idle
      ? ['energy', 'cost', 'power']
          .map((k) => idle.rows.find((r) => r.key === k)?.value)
          .filter((v): v is string => !!v && v !== '—')
          .join(' · ')
      : null
  );
  // M7: the curve as measured, against the daily reading that is billed.
  let reconcile = $derived.by(() => {
    const t = shown?.totals;
    if (!t || t.curve_kwh == null) return null;
    if (t.daily_kwh == null || t.daily_kwh <= 0) return m.curvePanel.curveOnly(fmtKwhExact(t.curve_kwh));
    return m.curvePanel.reconcile(fmtKwhExact(t.curve_kwh), fmtKwhExact(t.daily_kwh), fmtPct1(Math.abs(t.curve_kwh - t.daily_kwh) / t.daily_kwh));
  });
  // The parts of the daily reading beside them: matched to it (L1), so they add up and read as the bar inspector's
  // split of the same day.
  let splitLine = $derived.by(() => {
    const t = shown?.totals;
    if (!t || t.hc_kwh == null || t.hp_kwh == null) return null;
    const [hc, hp] = t.daily_kwh == null ? [t.hc_kwh, t.hp_kwh] : matchParts(t.daily_kwh, [t.hc_kwh, t.hp_kwh], 2).parts;
    return m.curvePanel.split(fmtKwhExact(hc), fmtKwhExact(hp));
  });
</script>

{#snippet nav()}
  {#if view !== 'day'}
    <!-- In Jour the navigator steps the day; elsewhere these step through the period's complete days. -->
    <div class="nav">
      <button type="button" class="btn btn-icon edged" aria-label={m.curvePanel.prev} aria-disabled={!canPrev} onclick={() => canPrev && onstep(-1)}>
        <span class="flip"><Icon name="chevron" /></span>
      </button>
      <button type="button" class="btn btn-icon edged" aria-label={m.curvePanel.next} aria-disabled={!canNext} onclick={() => canNext && onstep(1)}>
        <Icon name="chevron" />
      </button>
    </div>
  {/if}
{/snippet}

{#snippet body()}
  <div class="body">
    {#if error}
      <p class="error" role="status">{error} <button type="button" class="btn btn-sm" onclick={onretry}>{m.curvePanel.retry}</button></p>
    {:else if shown}
      {#if shown.points === 0}
        <p class="muted note">{m.curvePanel.emptyWhy(why ?? m.curvePanel.noLinky)}</p>
      {:else}
        <CurveChart
          intervals={shown.intervals}
          {split}
          kva={shown.power.kva}
          samples={shown.room?.samples ?? null}
          room={roomLabel}
          label={m.curvePanel.chart(fmtDateLong(shown.date))}
          {idle}
          bind:index />
        {#if !shown.complete}<p class="muted note">{m.curvePanel.incomplete(shown.points, halfHoursIn(shown.date))}</p>{/if}
        {#if reconcile}<p class="muted note num">{reconcile}</p>{/if}
        {#if splitLine}
          <p class="muted note num">{splitLine}{#if shown.totals.split_method !== 'curve'}<span class="est">{m.curvePanel.est}</span>{/if}</p>
        {/if}
        {#if shown.intervals.some((i) => i.boundary)}<p class="muted note">{m.curvePanel.boundary}</p>{/if}
      {/if}
    {:else}
      <div class="skeleton inset curve-sk" aria-hidden="true"></div>
    {/if}
  </div>
{/snippet}

<section class="panel wide" class:collapsible id={ANCHORS.curve} aria-labelledby="{ANCHORS.curve}-title">
  {#if collapsible}
    <Disclosure title={m.curvePanel.heading(fmtDateLong(dayIso))} meta={summary} heading="h2" buttonId="{ANCHORS.curve}-title" detail bind:open>
      <div class="inner-head">{@render nav()}</div>
      {@render body()}
    </Disclosure>
  {:else}
    <div class="head">
      <h2 id="{ANCHORS.curve}-title">{m.curvePanel.heading(fmtDateLong(dayIso))}</h2>
      {@render nav()}
    </div>
    {@render body()}
  {/if}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .inner-head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 4px;
  }
  /* Collapsed (Mois, Année): the panel is its one summary row; the section label keeps its type. */
  section.panel.collapsible :global(h2.dhead) {
    margin: -10px 0;
  }
  section.panel.collapsible :global(.disclosure.open h2.dhead) {
    margin-bottom: 0;
  }
  /* The summary takes the next line when the row is too narrow for both. */
  .collapsible :global(.dhead .dbtn) {
    flex-wrap: wrap;
    padding-block: 6px;
  }
  .collapsible :global(.dhead .meta) {
    white-space: normal;
    text-align: right;
  }
  .collapsible :global(.dhead .dtitle) {
    text-transform: none;
    letter-spacing: 0;
    font-size: 13px;
    color: var(--tx);
  }
  .edged {
    border-color: var(--line);
  }
  .flip {
    display: grid;
    transform: scaleX(-1);
  }
  /* The body keeps the chart's height while a day loads, so the panels below never move. */
  .body {
    min-height: 236px;
  }
  .curve-sk {
    height: 216px;
  }
  .note {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .est {
    margin-left: 4px;
    color: var(--mu);
  }
  .error {
    color: var(--bad);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    font-size: 13px;
  }
  .error .btn {
    color: var(--tx);
  }
</style>
