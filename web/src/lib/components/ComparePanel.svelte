<script lang="ts">
  import type { Average4, Comparison, Comparisons } from '$lib/api/types';
  import { addDays, previousName, type View } from '$lib/energy';
  import { fmtChangeShare, fmtDateLong, fmtKwhExact, fmtSigned } from '$lib/format';
  import { plural } from '$lib/plural';

  const COPY = {
    title: 'Comparaisons',
    previous: 'Période précédente',
    sameLength: 'la même durée juste avant',
    lastYear: 'Même période l’an dernier',
    avg4: {
      day: 'Moyenne des 4 derniers jours',
      week: 'Moyenne des 4 dernières semaines',
      month: 'Moyenne des 4 derniers mois',
      year: 'Moyenne des 4 dernières années'
    } as Record<View, string>,
    range: (a: string, b: string) => `${a} – ${b}`,
    pairs: (n: number) => `sur ${plural(n, 'jour comparable', 'jours comparables')}`,
    perDay: (cur: string, prev: string) => `${cur} par jour contre ${prev}`,
    fewer: (n: number) => `sur ${plural(n, 'période comparable', 'périodes comparables')}`,
    // Why a row reads « — ».
    nothing: 'aucun jour relevé à comparer',
    tooFew: (n: number, of: number) => `${plural(n, 'jour comparable', 'jours comparables')} sur ${of} : pas de comparaison`,
    zero: (view: View) => `rien de consommé ${view === 'day' ? 'ce jour-là' : 'sur cette période'} : pas de comparaison`,
    noUnits: {
      day: 'aucun des 4 derniers jours n’est comparable',
      week: 'aucune des 4 dernières semaines n’est comparable',
      month: 'aucun des 4 derniers mois n’est comparable',
      year: 'aucune des 4 dernières années n’est comparable'
    } as Record<View, string>,
    zeroBefore: 'rien de consommé sur les périodes précédentes',
    basis: 'Seuls les jours relevés des deux côtés comptent.',
    energyOnly: ' Le coût compare l’énergie seule, hors abonnement.'
  } as const;

  interface Props {
    comparison: Comparisons;
    view: View;
    tariff: boolean;
    class?: string;
  }
  let { comparison, view, tariff, class: cls = '' }: Props = $props();

  const dmy = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
  /** The compared days as a range, `to` exclusive (elapsed days only, so a running period is named by its days). */
  const range = (c: Comparison) => COPY.range(dmy(c.from), dmy(addDays(c.to, -1)));
  // `days`: a custom period, compared with as many days just before it (never the case for a whole view).
  const prevName = (c: Comparison) => (comparison.basis === 'days' ? COPY.sameLength : previousName(view, c.from));
  function lastYearName(c: Comparison): string {
    if (comparison.basis === 'days' || view === 'week') return range(c);
    if (view === 'day') return fmtDateLong(c.from);
    if (view === 'year') return c.from.slice(0, 4);
    return previousName('month', c.from);
  }
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);

  type Line = { label: string; basis: string | null; value: string; detail: string | null; why: string | null };
  /** A paired comparison: its change, the kWh and energy € differences and the days it counts, or « — » and why. */
  function pair(label: string, c: Comparison | null, name: (c: Comparison) => string): Line {
    if (!c) return { label, basis: null, value: '—', detail: null, why: COPY.nothing };
    const basis = name(c);
    if (!c.comparable) return { label, basis, value: '—', detail: null, why: COPY.tooFew(c.pairs, c.of) };
    const change = fmtChangeShare(c.change);
    if (change == null) return { label, basis, value: '—', detail: null, why: COPY.zero(view) };
    const eur = tariff ? diff(c.cur_energy_eur, c.prev_energy_eur) : null;
    const parts = [fmtSigned(diff(c.cur_kwh, c.prev_kwh), 'kWh'), ...(eur != null ? [fmtSigned(eur, '€')] : [])];
    return { label, basis, value: change, detail: `${parts.join(' · ')} ${COPY.pairs(c.pairs)}`, why: null };
  }
  function average(a: Average4 | null): Line {
    const label = COPY.avg4[view];
    if (!a) return { label, basis: null, value: '—', detail: null, why: COPY.nothing };
    if (a.units === 0) return { label, basis: null, value: '—', detail: null, why: COPY.noUnits[view] };
    const change = fmtChangeShare(a.change);
    if (change == null) return { label, basis: null, value: '—', detail: null, why: COPY.zeroBefore };
    const per = COPY.perDay(fmtKwhExact(a.cur_kwh_per_day), fmtKwhExact(a.prev_kwh_per_day));
    return { label, basis: null, value: change, detail: a.units < 4 ? `${per} ${COPY.fewer(a.units)}` : per, why: null };
  }
  let lines = $derived([
    pair(COPY.previous, comparison.previous, prevName),
    pair(COPY.lastYear, comparison.last_year, lastYearName),
    average(comparison.avg4)
  ]);
</script>

<section class="panel {cls}">
  <h2>{COPY.title}</h2>
  {#each lines as l (l.label)}
    <div class="row">
      <div class="label">{l.label}{#if l.basis}{' '}<span class="basis muted num">{l.basis}</span>{/if}</div>
      <!-- A change is plain text in every direction (DESIGN.md): never red or green. -->
      <div class="value num">{l.value}</div>
      {#if l.detail}<div class="muted note num">{l.detail}</div>{/if}
      {#if l.why}<div class="muted note">{l.why}</div>{/if}
    </div>
  {/each}
  <p class="muted foot">{COPY.basis}{#if tariff}{COPY.energyOnly}{/if}</p>
</section>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
    font-size: 13px;
  }
  .row:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
  .basis {
    display: block;
    font-size: 12px;
  }
  .value {
    font-size: 16px;
    font-weight: 600;
    text-align: right;
  }
  .note {
    grid-column: 1 / -1;
    font-size: 12px;
  }
  .foot {
    font-size: 12px;
    margin: 8px 0 0;
  }
</style>
