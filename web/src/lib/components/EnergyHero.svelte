<!-- Énergie's Résumé (direction-2 §2, « answer, then evidence »): the period's figure (hero 40/600, a Fig whose Fiche
     is the period's inspection with its provenance and every method note), the range with the kWh, the split bar
     (heures creuses hatched / heures pleines), the comparison sentence, then the key figures (Mois complet, Chauffage,
     Heures creuses) linking to their sections. Only the notes that change the figure's meaning stay on screen
     (missing days, prices applied after the fact, a partial radiator sum), each one muted line with an ⓘ. With a
     weather place, one muted line gives the period's outdoor mean and degree days (Plan 14). -->
<script lang="ts">
  import type { EnergyReport, LinkyState } from '$lib/api/types';
  import { dataSpan, periodTitle, previousName, spanLabel, type Span, type View } from '$lib/energy';
  import { fmtChangeShare, fmtDateLong, fmtDay, fmtDju, fmtTemp, eurDigits, fmtEurAt, fmtEurExact, fmtEurHero, fmtKwhHero, fmtKwhParts, fmtPct, fmtPct1, matchParts } from '$lib/format';
  import { m } from '$lib/i18n';
  import { inspectBucket } from '$lib/inspector';
  import { ENERGY_ANCHORS, ROUTES } from '$lib/paths';
  import { provenance } from '$lib/provenance';
  import { goToSection } from '$lib/sections';
  import { today } from '$lib/today.svelte';
  import { weather } from '$lib/stores/weather.svelte';
  import Fig from './Fig.svelte';
  import Icon from './Icon.svelte';
  import SplitBar from './SplitBar.svelte';

  interface Props {
    /** The period's report (`main`). */
    report: EnergyReport;
    view: View;
    /** The last day with data: a running period's range stops there. */
    last: string | null;
    /** The period on screen holds the last day with data: the full-month projection is about it. */
    latest?: boolean;
    /** The Linky state (first sync says so instead of « no data »). */
    linkyState?: LinkyState | null;
    /** The last Linky sync (epoch ms), for the Fiche's provenance. */
    syncAt?: number | null;
    /** The first day with data: a period before it offers to go there. */
    first?: string | null;
    ongofirst?: () => void;
    /** A key figure's section is revealed (opened) before the page goes to it. */
    onreveal?: (id: string) => void;
  }
  let { report, view, last, latest = false, linkyState = null, syncAt = null, first = null, ongofirst, onreveal }: Props = $props();

  let p = $derived(report.period);
  // € when a tariff priced the period, else Linky kWh, else (no Linky) radiator kWh.
  let kind = $derived<'eur' | 'kwh' | 'rad'>(report.tariff && p.eur != null ? 'eur' : report.linky ? 'kwh' : 'rad');
  let figure = $derived(kind === 'eur' ? fmtEurHero(p.eur) : kind === 'kwh' ? fmtKwhHero(p.kwh) : fmtKwhHero(p.radiators?.kwh));
  let split = $derived(p.kwh != null && p.hc_kwh != null && p.hp_kwh != null);
  // L1 at the total's decimals: the parts add up to the kWh shown on the range line.
  let parts = $derived(p.kwh != null ? fmtKwhParts(p.kwh, split ? [p.hc_kwh, p.hp_kwh] : []) : null);
  // The bar's proportions only (the words are the matched kWh): off-peak over off-peak + peak.
  let hcShare = $derived(split && (p.hc_kwh as number) + (p.hp_kwh as number) > 0 ? (p.hc_kwh as number) / ((p.hc_kwh as number) + (p.hp_kwh as number)) : null);
  let range = $derived(spanLabel(dataSpan(p, last)));
  let rangeLine = $derived.by(() => {
    if (kind === 'rad') return m.energyUi.radRange(range || fmtDateLong(p.from));
    const kwh = kind === 'eur' && parts ? parts.total : null;
    return [range, kwh].filter(Boolean).join(' · ');
  });
  // « énergie 92,11 € · abonnement 6,29 € »: the two lines of the cost, matched to the total shown (L1).
  let eurParts = $derived.by(() => {
    if (kind !== 'eur' || p.energy_eur == null || p.subscription_eur == null) return null;
    // At the figure's own decimals: cents below 1 000 €, whole euros above (as `fmtEurHero` shows the total).
    const digits = eurDigits(p.eur as number);
    const [energy, subscription] = matchParts(p.eur, [p.energy_eur, p.subscription_eur], digits).parts;
    return m.energyBoard.eurParts(fmtEurAt(energy, digits), fmtEurAt(subscription, digits));
  });
  let prev = $derived(report.comparison.previous);
  // M3: a change only when Plan 5 found enough comparable days; it compares consumption and says so.
  let change = $derived(prev?.comparable ? fmtChangeShare(prev.change) : null);
  // `basis: 'days'` (a custom period) compares with as many days just before; the views here are whole units.
  let prevName = $derived(prev ? (report.comparison.basis === 'days' ? m.hero.sameLength : previousName(view, prev.from)) : '');
  let noData = $derived(report.linky && p.kwh == null);
  // Plan 14: the period's outdoor mean and degree days, one muted line; nothing without a weather place.
  // Plan 15 (spec §7.2): in Mois, the change against the previous month at equal weather (v0.2's comparison) closes
  // the same line, never coloured.
  let adjusted = $derived(view === 'month' ? fmtChangeShare(prev?.weather?.change) : null);
  let outdoorLine = $derived(
    p.outdoor
      ? p.outdoor.mean_c != null
        ? m.weather.heroLine(fmtTemp(p.outdoor.mean_c), p.outdoor.dju != null ? fmtDju(p.outdoor.dju) : null) +
          (adjusted ? ` · ${m.weather.atEqualWeather(adjusted)}` : '')
        : m.weather.heroNone
      : null
  );
  // A period that ends before the first day with data (reached by a drill or a view switch).
  let beforeHistory = $derived(noData && !!first && p.to <= first);

  /** Notes that change what the figure means: on screen (ⓘ) and in the Fiche. */
  let meaning = $derived.by(() => {
    if (noData) return [];
    const out: string[] = [];
    if (p.missing_days > 0) out.push(p.eur != null ? `${m.hero.missing(p.missing_days)} ${m.hero.notCounted}` : m.hero.missing(p.missing_days));
    if (p.retro_priced && p.prices.length) out.push(m.hero.retro(fmtDay(p.prices[0].valid_from)));
    if (p.missing_colour_days > 0) out.push(m.energyTariff.notCounted(p.missing_colour_days));
    // Without Linky the figure is the radiators': a partial or missing sum says so.
    if (p.kwh == null && p.radiators?.coverage != null && p.radiators.coverage < 1) out.push(m.hero.radPartial(fmtPct1(p.radiators.coverage), p.to > today.iso));
    if (kind === 'rad' && !p.radiators) out.push(m.hero.radNone);
    return out;
  });
  /** How it was computed: in the Fiche only. */
  let method = $derived.by(() => {
    if (noData) return [];
    const out: string[] = [];
    if (p.estimated_split) out.push(m.hero.split(p.quality.estimated_days));
    if (p.radiators?.interpolated) out.push(m.hero.interpolated);
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
  let notes = $derived([...new Set([...meaning, ...method, ...ins.notes])]);
  let prov = $derived(
    kind === 'rad'
      ? provenance('radiator-meter', { nature: p.radiators?.interpolated || p.radiators?.apportioned ? 'estimated' : 'measured' })
      : provenance('linky-day', {
          day: report.last_day,
          syncAt,
          nature: kind === 'eur' ? 'estimated' : 'measured',
          method: kind === 'eur' ? m.energyUi.heroMethod : null
        })
  );
  let title = $derived(periodTitle(view, { from: p.from, to: p.to } as Span));
  let figLabel = $derived(kind === 'eur' ? `${figure}, ${m.hero.estimate}` : figure);

  // The key figures (direction-2 §2): each a link to its section, named « Chauffage, 63 % de la maison ».
  type Key = { id: string; label: string; value: string; sub: string | null };
  // The key column exists whenever Linky has data for the period, whatever figures it holds.
  let keyed = $derived(report.linky && !noData);
  // Three fixed slots (full month, heating, off-peak): a figure the period lacks leaves its slot empty, so stepping
  // to a past month never moves the rows below it.
  let slots = $derived.by((): (Key | null)[] => {
    if (!report.linky || noData) return [];
    const pm = report.projection?.month;
    const month: Key | null =
      latest && pm
        ? { id: ENERGY_ANCHORS.projection, label: m.energyUi.keyMonth, value: m.projection.approx(pm.eur != null ? fmtEurHero(pm.eur) : fmtKwhHero(pm.kwh)), sub: null }
        : null;
    const h = report.heating;
    const heating: Key | null =
      !h.inconsistent && h.value != null ? { id: ENERGY_ANCHORS.where, label: m.energyUi.keyHeating, value: fmtPct(h.value), sub: m.energyUi.keyHeatingVal } : null;
    const lens = report.hc_lens;
    const offpeak: Key | null =
      report.tariff && report.option !== 'base' && lens?.hc_share != null
        ? {
            id: ENERGY_ANCHORS.offpeak,
            label: m.energyUi.keyOffpeak,
            value: fmtPct(lens.hc_share),
            sub: lens.slot_share != null ? m.energyUi.keyOffpeakVal(fmtPct(lens.slot_share)) : null
          }
        : null;
    return [month, heating, offpeak];
  });
</script>

<section class="panel hero" aria-labelledby="period-label">
 <div class="grid" class:keyed>
  <div class="answer">
    {#if beforeHistory && first}
      <p class="empty">{m.energyUi.noData(title, fmtDateLong(first))}</p>
      <button type="button" class="btn btn-ghost go" onclick={() => ongofirst?.()}>{m.energyUi.goFirst(fmtDay(first))}</button>
    {:else}
      <div class="figline">
        <Fig value={figure} label={figLabel} {title} rows={ins.rows} empty={ins.empty} {notes} provenance={prov} class="hero-fig">
          <span class="big num">{figure}</span>{#if kind === 'eur'}<span class="tag" aria-hidden="true">{m.fiche.est}</span>{/if}
        </Fig>
      </div>
      {#if noData}
        <p class="muted line">{linkyState === 'never' ? m.energyUi.firstSync : m.hero.noData}</p>
      {:else}
        {#if rangeLine}<p class="range num">{rangeLine}</p>{/if}
        {#if eurParts}<p class="parts num">{eurParts}</p>{/if}
        {#if kind === 'rad' && p.radiators?.eur != null}
          <!-- Without Linky: the radiators' € from your tariff, energy only (no bill, no subscription). -->
          <p class="parts num">{m.projection.approx(fmtEurExact(p.radiators.eur))}<span class="tag">{' '}{m.fiche.est}</span>{' · '}{m.energyUi.energyOnly}</p>
        {/if}
        {#if report.linky && parts}
          <SplitBar share={hcShare}
            hc={split ? parts.parts[0] : null} hp={split ? parts.parts[1] : null} />
        {/if}
        {#if change && prev}<p class="muted delta">{m.hero.compare(change, prevName, prev.pairs)}</p>{/if}
        <!-- With a weather place the line's height is held (no shift when a period without figures steps in). -->
        {#if outdoorLine}<p class="muted outdoor num">{outdoorLine}</p>
        {:else if weather.on}<p class="muted outdoor" aria-hidden="true">&nbsp;</p>{/if}
        {#each meaning as n (n)}<p class="muted note"><Icon name="info" size={14} /><span>{n}</span></p>{/each}
        {#if report.linky && !report.tariff}
          <p class="muted note tariff">{m.energyUi.noTariff} <a class="link" href="{ROUTES.tariff}">{m.energyUi.noTariffCta}</a></p>
        {/if}
      {/if}
    {/if}
  </div>
  {#if keyed}
    <!-- Always three rows high: a period with fewer key figures (a past month, Base) keeps the Résumé's height, so
         the panels below never move when a report arrives. -->
    <ul class="keys">
      {#each slots as k, i (i)}
        {#if !k}<li class="none" aria-hidden="true"></li>{:else}
        <li>
          <a href="#{k.id}" onclick={(e) => goToSection(e, k.id, onreveal)} aria-label={m.energyUi.keyName(k.label, k.sub ? `${k.value} ${k.sub}` : k.value)}>
            <span class="klabel">{k.label}</span>
            <span class="kval"><span class="num v">{k.value}</span>{#if k.sub}<span class="ksub">{k.sub}</span>{/if}</span>
            <span class="chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
          </a>
        </li>
        {/if}
      {/each}
    </ul>
  {/if}
 </div>
</section>

<style>
  .hero {
    container-type: inline-size;
  }
  .grid {
    display: grid;
    gap: 14px;
  }
  .answer {
    min-width: 0;
  }
  .figline {
    min-height: 52px;
    display: flex;
    align-items: center;
  }
  .hero :global(.fig.hero-fig) {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    text-decoration: none;
  }
  .hero :global(.fig.hero-fig .big) {
    text-decoration: underline dotted var(--fa) 1px;
    text-underline-offset: 6px;
  }
  @media (hover: hover) {
    .hero :global(.fig.hero-fig:hover .big) {
      text-decoration-color: var(--mu);
    }
  }
  .big {
    font-size: var(--fs-hero);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .tag {
    font-size: 12px;
    color: var(--mu);
  }
  .range {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--tx);
  }
  .parts {
    margin: 2px 0 12px;
    font-size: 13px;
    color: var(--mu);
  }
  .outdoor {
    min-height: 1.45em;
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.45;
  }
  .line,
  .delta {
    margin: 10px 0 0;
    font-size: 13px;
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 6px 0 0;
    font-size: 12px;
  }
  .note :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .tariff {
    display: block;
  }
  .link {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .empty {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .go {
    margin-top: 10px;
  }
  /* Key figures (Tableau « Résumé »): a grouped list on --s2 under the answer, rows 52 px with a chevron; beside the
     answer (hairline-free, same list) when the Résumé is wide (from 640 px of its own width). */
  .keys {
    list-style: none;
    margin: 0;
    padding: 0 14px;
    border-radius: var(--r-group);
    background: var(--s2);
    min-height: calc(3 * 52px + 2px);
  }
  .keys li {
    min-height: 52px;
  }
  .keys li + li {
    border-top: 1px solid var(--line);
  }
  .keys li.none {
    border-top-color: transparent;
  }
  .keys a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    height: 52px;
    padding: 4px 0;
    color: var(--tx);
    text-decoration: none;
  }
  .klabel {
    font-size: 13px;
    color: var(--mu);
  }
  .kval {
    display: grid;
    justify-items: end;
  }
  .v {
    font-size: 15px;
    font-weight: 600;
  }
  .ksub {
    font-size: 11px;
    color: var(--mu);
  }
  .chev {
    display: grid;
    color: var(--mu);
    transition: transform var(--t-state) var(--ease-out);
  }
  @media (hover: hover) {
    .keys a:hover .chev {
      transform: translateX(2px);
      color: var(--tx);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  @container (min-width: 640px) {
    .grid.keyed {
      grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
      gap: 24px;
    }
    .keys {
      align-self: start;
    }
  }
  @container (max-width: 419px) {
    .big {
      font-size: 32px;
    }
  }
</style>
