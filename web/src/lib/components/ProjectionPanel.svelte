<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import type { Projection } from '$lib/api/types';
  import { addDays, SERIES } from '$lib/energy';
  import { fmtDay, fmtEurHero, fmtKwhExact, fmtKwhHero, fmtPrice, monthName } from '$lib/format';
  import { plural } from '$lib/plural';

  const COPY = {
    title: 'Projection',
    month: (m: string) => `${m}, mois complet`,
    measured: (v: string) => `dont ${v} mesurés`,
    filled: (n: number) => plural(n, 'jour manquant estimé', 'jours manquants estimés'),
    rolling: '365 prochains jours',
    range: (a: string, b: string) => `${a} – ${b}`,
    approx: (v: string) => `≈ ${v}`,
    estimate: 'Estimation, à consommation et prix d’aujourd’hui.',
    how: 'Comment c’est calculé',
    perDay: (v: string) => `Base : ${v} par jour`,
    price: (p: string, d: string) => `prix moyen ${p} au ${d}`,
    method: {
      seasonal: 'ajusté selon les mêmes mois de l’an dernier',
      linear: 'd’après les 30 derniers jours (pas encore un an d’historique)',
      mixed: 'ajusté selon l’an dernier quand le mois est connu, sinon d’après les 30 derniers jours'
    },
    subscription: 'Abonnement compris, au tarif d’aujourd’hui.',
    none: 'Pas encore assez de jours relevés pour une projection.',
    monthsCaption: 'Projection des 12 prochains mois (estimation)',
    monthCol: 'Mois',
    value: 'Estimation'
  } as const;

  interface Props {
    projection: Projection | null;
    class?: string;
  }
  let { projection, class: cls = '' }: Props = $props();

  const short = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthShort = (key: string) => short.format(new Date(`${key}-01T12:00:00Z`));
  const dmy = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
  const money = (eur: number | null, kwh: number | null) => (eur != null ? fmtEurHero(eur) : fmtKwhHero(kwh));
  let months = $derived(projection?.year.months ?? []);
  // Euros only when every month has them (a tariff), else kWh: one unit along the line.
  let euros = $derived(months.length > 0 && months.every((m) => m.eur != null));
  let values = $derived(months.map((m) => (euros ? (m.eur as number) : m.kwh)));
  let width = $state(0);
  let SW = $derived(width > 0 ? width : 240);
  const SH = 36;
  let y = $derived(scaleLinear().domain([0, Math.max(1, ...values)]).range([SH - 1, 2]));
  let points = $derived(values.map((v, i) => `${2 + (i / Math.max(1, values.length - 1)) * (SW - 4)},${y(v)}`).join(' '));
</script>

<section class="panel {cls}">
  <h2>{COPY.title}</h2>
  {#if !projection}
    <p class="muted note">{COPY.none}</p>
  {:else}
    {@const m = projection.month}
    {@const r = projection.rolling}
    {@const actual = m.eur != null ? (m.actual_eur != null ? fmtEurHero(m.actual_eur) : null) : m.actual_kwh != null ? fmtKwhHero(m.actual_kwh) : null}
    <div class="row">
      <div class="label">{COPY.month(monthName(`${m.key}-01`))}</div>
      <div class="value num">{COPY.approx(money(m.eur, m.kwh))}</div>
      {#if actual || m.filled_days > 0}
        <div class="muted note num">
          {#if actual}{COPY.measured(actual)}{/if}{#if actual && m.filled_days > 0}{' · '}{/if}{#if m.filled_days > 0}{COPY.filled(m.filled_days)}{/if}
        </div>
      {/if}
    </div>
    <div class="row">
      <div class="label">{COPY.rolling}</div>
      <div class="value num">{COPY.approx(money(r.eur, r.kwh))}</div>
      <div class="muted note num">{COPY.range(dmy(r.from), dmy(addDays(r.to, -1)))}</div>
    </div>
    {#if months.length}
      <!-- Dashed: every point is an estimate. The values are in the table below. -->
      <div class="spark" bind:clientWidth={width}>
        <svg viewBox="0 0 {SW} {SH}" width={SW} height={SH} aria-hidden="true">
          <!-- The scale starts at zero: the baseline says so, so a level year reads level. -->
          <line class="zero" x1="0" x2={SW} y1={SH - 0.5} y2={SH - 0.5} />
          <polyline class="proj" {points} style:stroke={SERIES.home} />
        </svg>
        <div class="spark-ends" aria-hidden="true"><span>{monthShort(months[0].key)}</span><span>{monthShort(months[months.length - 1].key)}</span></div>
      </div>
      <div class="visually-hidden"><table>
        <caption>{COPY.monthsCaption}</caption>
        <thead><tr><th scope="col">{COPY.monthCol}</th><th scope="col">{COPY.value}</th></tr></thead>
        <tbody>
          {#each months as x (x.key)}
            <tr><th scope="row">{monthName(`${x.key}-01`)}</th><td>{COPY.approx(euros ? fmtEurHero(x.eur) : fmtKwhHero(x.kwh))}</td></tr>
          {/each}
        </tbody>
      </table></div>
    {/if}
    <p class="muted note est">{COPY.estimate}</p>
    <details>
      <summary>{COPY.how}</summary>
      <ul>
        <li class="num">{COPY.perDay(fmtKwhExact(r.per_day_kwh))}, {COPY.method[r.method]}</li>
        {#if r.price_eur_kwh != null}<li class="num">{COPY.price(fmtPrice(r.price_eur_kwh), fmtDay(addDays(r.from, -1)))}</li>{/if}
        {#if r.eur != null}<li>{COPY.subscription}</li>{/if}
      </ul>
    </details>
  {/if}
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
  .value {
    font-size: 16px;
    font-weight: 600;
    text-align: right;
  }
  .note {
    grid-column: 1 / -1;
    font-size: 12px;
    margin: 0;
  }
  .spark {
    min-width: 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .spark svg {
    display: block;
    max-width: 100%;
    overflow: visible;
  }
  .zero {
    stroke: var(--line);
    stroke-width: 1;
  }
  .proj {
    fill: none;
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    stroke-linejoin: round;
  }
  .spark-ends {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: 11px;
    color: var(--fa);
    font-variant-numeric: tabular-nums;
  }
  .est {
    margin-top: 8px;
  }
  details {
    margin-top: 2px;
    font-size: 12px;
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--tx);
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  /* The disclosure's own chevron, drawn in ink like the page's other controls. */
  summary::before {
    content: '';
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform var(--t-state) ease;
  }
  details[open] summary::before {
    transform: rotate(45deg);
  }
  @media (prefers-reduced-motion: reduce) {
    summary::before {
      transition: none;
    }
  }
  details ul {
    margin: 0;
    padding-left: 18px;
    color: var(--mu);
  }
  details li + li {
    margin-top: 2px;
  }
</style>
