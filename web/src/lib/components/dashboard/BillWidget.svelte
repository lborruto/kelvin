<!-- The month so far (Tableau §3 « BillWidget »): « Octobre, jusqu’au 15 », the € with the subscription (kWh
     without a tariff), the month's end ≈ (the report's projection, « est. »), how far into the month we are and
     last month's figure. A Fig: the exact parts in its Fiche, Linky and the tariff as its source. Hidden by the
     caller without Linky. `compact` is the phone's half-width card. -->
<script lang="ts">
  import type { EnergyReport } from '$lib/api/types';
  import { fmtEurExact, fmtEurHero, fmtKwhExact, fmtKwhHero, monthTitle, monthWord } from '$lib/format';
  import { m } from '$lib/i18n';
  import { monthSpan } from '$lib/dashboard';
  import { ROUTES } from '$lib/paths';
  import { provenance } from '$lib/provenance';
  import Fig from '../Fig.svelte';
  import Widget from '../Widget.svelte';

  interface Props {
    report: EnergyReport;
    todayIso: string;
    now: number;
    compact?: boolean;
    span?: 1 | 2;
  }
  let { report, todayIso, now, compact = false, span = 1 }: Props = $props();
  let s = $derived(monthSpan(todayIso));
  let p = $derived(report.period);
  let priced = $derived(report.tariff && p.eur != null);
  let last = $derived(report.last_day && report.last_day >= s.from ? Number(report.last_day.slice(8, 10)) : null);
  let title = $derived(last ? m.maison.billTitle(monthTitle(s.from), last) : monthTitle(s.from));
  let figure = $derived(priced ? fmtEurHero(p.eur) : fmtKwhHero(p.kwh));
  let pm = $derived(report.projection?.month.key === s.from.slice(0, 7) ? report.projection.month : null);
  let end = $derived(pm ? (priced && pm.eur != null ? fmtEurHero(pm.eur) : pm.kwh != null && !priced ? fmtKwhHero(pm.kwh) : null) : null);
  let prev = $derived(report.buckets.find((b) => b.key.startsWith(s.prevFrom.slice(0, 7))) ?? null);
  let prevText = $derived(prev ? (priced ? (prev.eur != null ? fmtEurExact(prev.eur) : null) : prev.kwh != null ? fmtKwhExact(prev.kwh) : null) : null);
  let rows = $derived(
    priced
      ? [
          { label: m.maison.billEnergy, value: fmtEurExact(p.energy_eur) },
          { label: m.maison.billSubscription, value: fmtEurExact(p.subscription_eur) },
          { label: m.maison.billTotal, value: fmtEurExact(p.eur) },
          { label: m.maison.billKwh, value: fmtKwhExact(p.kwh) }
        ]
      : [{ label: m.maison.billKwh, value: fmtKwhExact(p.kwh) }]
  );
  let prov = $derived(provenance('linky-day', { day: report.last_day }, now));
  let pct = $derived(Math.min(100, Math.max(0, (s.day / s.days) * 100)));
</script>

<Widget {title} aside={compact || !priced ? undefined : m.maison.billSub} {span} pad={compact ? 'sm' : 'md'} class="bill">
  <div class="fig-row">
    <span class="big num" class:compact><Fig value={figure} {title} {rows} provenance={prov} /></span>
    {#if end && !compact}<a class="end muted" href={ROUTES.energy}>{m.maison.billEnd(end)} <span class="note">{m.fiche.est}</span></a>{/if}
  </div>
  {#if end && compact}<p class="note end-c">{m.maison.billEnd(end)} {m.fiche.est}</p>{/if}
  <div class="bar" role="img" aria-label={m.maison.billProgress(s.day, s.days)}><i style:width="{pct}%"></i></div>
  {#if !compact}
    <p class="foot note"><span>{m.maison.billDays(s.day, s.days)}</span>{#if prevText}<span>{m.maison.billPrev(monthWord(s.prevFrom), prevText)}</span>{/if}</p>
  {/if}
</Widget>

<style>
  p {
    margin: 0;
  }
  .fig-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .big {
    font-size: 34px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.15;
    white-space: nowrap;
  }
  .big.compact {
    font-size: 26px;
  }
  .end {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    text-decoration: none;
  }
  .end-c {
    margin-top: 4px;
  }
  .bar {
    height: 10px;
    margin-top: 12px;
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--s2);
  }
  :global(.w.sm) .bar {
    height: 6px;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--tx);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
  }
</style>
