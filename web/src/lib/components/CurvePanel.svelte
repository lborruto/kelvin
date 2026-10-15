<script lang="ts">
  import CurveChart from './CurveChart.svelte';
  import Icon from './Icon.svelte';
  import type { EnergyDay } from '$lib/api/types';
  import { halfHoursIn, type View } from '$lib/energy';
  import { fmtDateLong, fmtKwhExact, fmtPct1 } from '$lib/format';

  const COPY = {
    heading: (d: string) => `Courbe du ${d}`,
    chart: (d: string) => `Consommation par demi-heure le ${d}`,
    prev: 'Jour précédent',
    next: 'Jour suivant',
    retry: 'Réessayer',
    noLinky: 'pas de données Linky pour ce jour',
    emptyWhy: (why: string) => `Pas de courbe pour ce jour\u00a0: ${why}.`,
    beforeHistory: (d: string) => `antérieure à l’historique de courbe (depuis le ${d})`,
    beforeCounted: (d: string) => `antérieure au premier jour compté (depuis le ${d})`,
    quota: 'pas encore récupérée (quota)',
    reconcile: (curve: string, daily: string, gap: string) => `Courbe ${curve} · relevé journalier ${daily} (écart ${gap})`,
    curveOnly: (curve: string) => `Courbe ${curve}`,
    split: (hc: string, hp: string) => `HC ${hc} · HP ${hp}, d’après le relevé journalier`,
    est: 'est.',
    incomplete: (n: number, of: number) => `Courbe incomplète (${n}/${of} demi-heures)`,
    boundary: '≈\u00a0: une heure creuse commence ou finit dans cette demi-heure\u00a0; sa part y est estimée au prorata.'
  } as const;

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
      ? COPY.beforeCounted(fmtDateLong(shown.counted_from))
      : curveSince && dayIso < curveSince
        ? COPY.beforeHistory(fmtDateLong(curveSince))
        : quota
          ? COPY.quota
          : null
  );
  // M7: the curve as measured, against the daily reading that is billed.
  let reconcile = $derived.by(() => {
    const t = shown?.totals;
    if (!t || t.curve_kwh == null) return null;
    if (t.daily_kwh == null || t.daily_kwh <= 0) return COPY.curveOnly(fmtKwhExact(t.curve_kwh));
    return COPY.reconcile(fmtKwhExact(t.curve_kwh), fmtKwhExact(t.daily_kwh), fmtPct1(Math.abs(t.curve_kwh - t.daily_kwh) / t.daily_kwh));
  });
  let splitLine = $derived(
    shown && shown.totals.hc_kwh != null && shown.totals.hp_kwh != null
      ? COPY.split(fmtKwhExact(shown.totals.hc_kwh), fmtKwhExact(shown.totals.hp_kwh))
      : null
  );
</script>

<section class="panel wide" id="courbe" aria-labelledby="courbe-title">
  <div class="head">
    <h2 id="courbe-title">{COPY.heading(fmtDateLong(dayIso))}</h2>
    {#if view !== 'day'}
      <!-- In Jour the navigator steps the day; elsewhere these step through the period's complete days. -->
      <div class="nav">
        <button type="button" class="btn btn-icon edged" aria-label={COPY.prev} aria-disabled={!canPrev} onclick={() => canPrev && onstep(-1)}>
          <span class="flip"><Icon name="chevron" /></span>
        </button>
        <button type="button" class="btn btn-icon edged" aria-label={COPY.next} aria-disabled={!canNext} onclick={() => canNext && onstep(1)}>
          <Icon name="chevron" />
        </button>
      </div>
    {/if}
  </div>
  <div class="body">
    {#if error}
      <p class="error" role="status">{error} <button type="button" class="btn btn-sm" onclick={onretry}>{COPY.retry}</button></p>
    {:else if shown}
      {#if shown.points === 0}
        <p class="muted note">{COPY.emptyWhy(why ?? COPY.noLinky)}</p>
      {:else}
        <CurveChart
          intervals={shown.intervals}
          {split}
          kva={shown.power.kva}
          samples={shown.room?.samples ?? null}
          room={shown.room?.name ?? null}
          label={COPY.chart(fmtDateLong(shown.date))}
          bind:index />
        {#if !shown.complete}<p class="muted note">{COPY.incomplete(shown.points, halfHoursIn(shown.date))}</p>{/if}
        {#if reconcile}<p class="muted note num">{reconcile}</p>{/if}
        {#if splitLine}
          <p class="muted note num">{splitLine}{#if shown.totals.split_method !== 'curve'}<span class="est">{COPY.est}</span>{/if}</p>
        {/if}
        {#if shown.intervals.some((i) => i.boundary)}<p class="muted note">{COPY.boundary}</p>{/if}
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
