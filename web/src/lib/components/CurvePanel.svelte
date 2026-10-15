<script lang="ts">
  import CurveChart from './CurveChart.svelte';
  import Icon from './Icon.svelte';
  import type { EnergyDay } from '$lib/api/types';
  import { halfHoursIn, type View } from '$lib/energy';
  import { fmtDateLong, fmtKwhExact, fmtPct1, matchParts } from '$lib/format';
  import { m } from '$lib/i18n';
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
  }
  let { dayIso, day, error, view, split, canPrev, canNext, onstep, onretry, curveSince, quota, index = $bindable(null) }: Props = $props();

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

<section class="panel wide" id={ANCHORS.curve} aria-labelledby="{ANCHORS.curve}-title">
  <div class="head">
    <h2 id="{ANCHORS.curve}-title">{m.curvePanel.heading(fmtDateLong(dayIso))}</h2>
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
  </div>
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
          room={shown.room?.name ?? null}
          label={m.curvePanel.chart(fmtDateLong(shown.date))}
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
