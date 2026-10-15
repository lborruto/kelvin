<script lang="ts">
  import ChartInspector from './ChartInspector.svelte';
  import type { EnergyReport } from '$lib/api/types';
  import { dataSpan, previousName, spanLabel, type View } from '$lib/energy';
  import { fmtChangeShare, fmtDay, fmtEurExact, fmtEurHero, fmtKwhHero, fmtKwhParts, fmtPct1 } from '$lib/format';
  import { m } from '$lib/i18n';
  import { inspectBucket } from '$lib/inspector';
  import { desktop } from '$lib/media.svelte';
  import { ANCHORS, ROUTES } from '$lib/paths';
  import { today } from '$lib/today.svelte';

  interface Props {
    /** The period's report (`main`). */
    report: EnergyReport;
    view: View;
    /** The last day with data: a running period's range stops there. */
    last: string | null;
  }
  let { report, view, last }: Props = $props();
  const uid = $props.id();

  let p = $derived(report.period);
  // € when a tariff priced the period, else Linky kWh, else (no Linky) radiator kWh.
  let kind = $derived<'eur' | 'kwh' | 'rad'>(report.tariff && p.eur != null ? 'eur' : report.linky ? 'kwh' : 'rad');
  let figure = $derived(kind === 'eur' ? fmtEurHero(p.eur) : kind === 'kwh' ? fmtKwhHero(p.kwh) : fmtKwhHero(p.radiators?.kwh));
  // L1: HC and HP at the total's decimals, adding up to it. One string: Svelte trims a block's leading space.
  let figures = $derived.by(() => {
    if (p.kwh == null) return m.hero.radiatorsFigure(fmtKwhHero(p.radiators?.kwh));
    const split = p.hc_kwh != null && p.hp_kwh != null;
    const f = fmtKwhParts(p.kwh, split ? [p.hc_kwh, p.hp_kwh] : []);
    return [f.total, ...(split ? [m.hero.hcFigure(f.parts[0]), m.hero.hpFigure(f.parts[1])] : [])].join(' · ');
  });
  let range = $derived(spanLabel(dataSpan(p, last)));
  let breakdown = $derived(
    report.tariff && p.eur != null && p.energy_eur != null && p.subscription_eur != null
      ? m.hero.breakdown(fmtEurExact(p.energy_eur), fmtEurExact(p.subscription_eur))
      : null
  );
  let prev = $derived(report.comparison.previous);
  // M3: a change only when Plan 5 found enough comparable days; it compares consumption and says so.
  let change = $derived(prev?.comparable ? fmtChangeShare(prev.change) : null);
  let noData = $derived(report.linky && p.kwh == null);
  let notes = $derived.by(() => {
    if (noData) return [];
    const out: string[] = [];
    if (p.missing_days > 0) out.push(p.eur != null ? `${m.hero.missing(p.missing_days)} ${m.hero.notCounted}` : m.hero.missing(p.missing_days));
    if (p.estimated_split) out.push(m.hero.split(p.quality.estimated_days));
    if (p.radiators?.interpolated) out.push(m.hero.interpolated);
    if (p.retro_priced && p.prices.length) out.push(m.hero.retro(fmtDay(p.prices[0].valid_from)));
    if (p.missing_colour_days > 0) out.push(m.energyTariff.notCounted(p.missing_colour_days));
    // Without Linky the figure is the radiators': a partial or missing sum says so.
    if (p.kwh == null && p.radiators?.coverage != null && p.radiators.coverage < 1) out.push(m.hero.radPartial(fmtPct1(p.radiators.coverage), p.to > today.iso));
    if (kind === 'rad' && !p.radiators) out.push(m.hero.radNone);
    return out;
  });
  let ins = $derived(
    inspectBucket(p, {
      group: view,
      span: { from: p.from, to: p.to },
      linky: report.linky,
      radiators: report.quality.radiators_since != null,
      today: today.iso
    })
  );
  // `basis: 'days'` (a custom period) compares with as many days just before; the views here are whole units.
  let prevName = $derived(prev ? (report.comparison.basis === 'days' ? m.hero.sameLength : previousName(view, prev.from)) : '');
  let open = $state(false);
  let hovering = $state(false);
  let mode = $derived<'card' | 'sheet'>(desktop.matches ? 'card' : 'sheet');
  let figBtn: HTMLButtonElement | undefined = $state();
  /** Esc inside the card or sheet closes it and gives focus back to the figure. */
  function close() {
    figBtn?.focus();
    open = false;
    hovering = false;
  }
</script>

<section class="panel hero wide" aria-labelledby="period-label">
  <div class="fig-wrap">
    <button
      bind:this={figBtn}
      type="button"
      class="figure"
      aria-expanded={open}
      aria-controls="{uid}-ins"
      onclick={() => (open = !open)}
      onpointerenter={(e) => {
        if (e.pointerType === 'mouse') hovering = true;
      }}
      onpointerleave={() => (hovering = false)}
      onkeydown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          open = false;
        }
      }}>
      <span class="big num">{figure}</span>{#if kind === 'eur'}<span class="tag">{m.hero.estimate}</span>{/if}
      <span class="visually-hidden">{m.hero.details}</span>
    </button>
    {#if mode === 'card' && (open || hovering)}
      <ChartInspector {ins} mode="card" id="{uid}-ins" top={46} pinned={open} onclose={close} />
    {/if}
  </div>
  <p class="sub num"><span class="figs">{figures}</span>{#if range}<span class="range"><span class="sep">{' · '}</span>{range}</span>{/if}</p>
  {#if breakdown}<p class="muted breakdown num">{breakdown}</p>{/if}
  {#if change && prev}<p class="muted delta">{m.hero.compare(change, prevName, prev.pairs)}</p>{/if}
  {#if noData}<p class="muted small">{m.hero.noData}</p>{/if}
  {#each notes as n (n)}<p class="muted small">{n}</p>{/each}
  {#if report.linky && !report.tariff}<p class="muted small"><a href="{ROUTES.home}#{ANCHORS.tariff}">{m.hero.tariffLink}</a>{m.hero.tariffTail}</p>{/if}
  <!-- Phone: the sheet docks at the hero's end, so the figure keeps its lines under it. -->
  {#if mode === 'sheet' && open}<ChartInspector {ins} mode="sheet" id="{uid}-ins" pinned onclose={close} />{/if}
</section>

<style>
  .fig-wrap {
    position: relative;
    display: inline-block;
  }
  /* The figure is a button (it opens the period's inspector) that looks like the figure it is. */
  .figure {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--tx);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  @media (hover: hover) {
    .figure:hover .big {
      text-decoration: underline dotted var(--fa);
      text-underline-offset: 6px;
    }
  }
  .big {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .tag {
    font-size: 12px;
    color: var(--mu);
  }
  .sub,
  .breakdown,
  .delta {
    font-size: 13px;
    margin: 6px 0 0;
  }
  .small {
    font-size: 12px;
    margin: 6px 0 0;
  }
  a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  /* Phone: the range gets its own line, apart from the kWh figures. */
  @media (max-width: 599px) {
    .sub .range {
      display: block;
    }
    .sub .sep {
      display: none;
    }
  }
</style>
