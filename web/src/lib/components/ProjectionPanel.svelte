<script lang="ts">
  import { ENERGY_ANCHORS } from '$lib/paths';
  import Disclosure from './Disclosure.svelte';
  import { scaleLinear } from 'd3-scale';
  import type { Projection } from '$lib/api/types';
  import { addDays, SERIES } from '$lib/energy';
  import { fmtDateLong, fmtDay, fmtEurHero, fmtKwhExact, fmtKwhHero, fmtPrice, monthName } from '$lib/format';
  import { locale, m } from '$lib/i18n';
  import { projectionLines } from '$lib/weatherCost';

  /** Beyond this many days behind today, the backend gives no projection (report.py `STALE_DAYS`). */
  const STALE_DAYS = 3;

  interface Props {
    projection: Projection | null;
    /** The report's last day with Linky data: the 30-day base ends there, and too old a day means no projection. */
    last: string | null;
    /** Today in Paris (ISO). */
    today: string;
    class?: string;
  }
  let { projection, last, today, class: cls = '' }: Props = $props();

  const dayNo = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
  // No projection: Linky is late (the backend's reason when its last day is too old), else too few days.
  let why = $derived(last && dayNo(today) - dayNo(last) > STALE_DAYS ? m.projection.late(fmtDateLong(last)) : m.projection.none);

  let short = $derived(new Intl.DateTimeFormat(locale.intl, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
  const monthShort = (key: string) => short.format(new Date(`${key}-01T12:00:00Z`));
  const dmy = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
  const money = (eur: number | null, kwh: number | null) => (eur != null ? fmtEurHero(eur) : fmtKwhHero(kwh));
  let months = $derived(projection?.year.months ?? []);
  // Euros only when every month has them (a tariff), else kWh: one unit along the line.
  let euros = $derived(months.length > 0 && months.every((mo) => mo.eur != null));
  let values = $derived(months.map((mo) => (euros ? (mo.eur as number) : mo.kwh)));
  let width = $state(0);
  let SW = $derived(width > 0 ? width : 240);
  const SH = 32;
  let y = $derived(scaleLinear().domain([0, Math.max(1, ...values)]).range([SH - 1, 2]));
  let points = $derived(values.map((v, i) => `${2 + (i / Math.max(1, values.length - 1)) * (SW - 4)},${y(v)}`).join(' '));
</script>

<!-- Analyse card: the full month and the next 365 days with the 12-month sparkline (the current month marked) in L0;
     the method one « Comment c'est calculé » away. -->
<section class="panel {cls}" id={ENERGY_ANCHORS.projection}>
  <h3>{m.projection.title}</h3>
  <p class="muted covers">{m.projection.covers}</p>
  {#if !projection}
    <p class="muted note">{why}</p>
  {:else}
    {@const pm = projection.month}
    {@const r = projection.rolling}
    {@const actual = pm.eur != null ? (pm.actual_eur != null ? fmtEurHero(pm.actual_eur) : null) : pm.actual_kwh != null ? fmtKwhHero(pm.actual_kwh) : null}
    <div class="row">
      <div class="label">{m.projection.month(monthName(`${pm.key}-01`))}</div>
      <div class="value num">{m.projection.approx(money(pm.eur, pm.kwh))}{#if pm.method === 'weather'}<span class="muted by"
          >{' '}{m.weatherCost.projWeather}</span>{/if}</div>
      {#if actual || pm.filled_days > 0}
        <div class="muted note num">
          {#if actual}{m.projection.measured(actual)}{/if}{#if actual && pm.filled_days > 0}{' · '}{/if}{#if pm.filled_days > 0}{m.projection.filled(pm.filled_days)}{/if}
        </div>
      {/if}
    </div>
    <div class="row">
      <div class="label">{m.projection.rolling}</div>
      <div class="value num">{m.projection.approx(money(r.eur, r.kwh))}</div>
      <div class="muted note num">{m.projection.range(dmy(r.from), dmy(addDays(r.to, -1)))}</div>
    </div>
    {#if months.length}
      <!-- Dashed: every month is projected (the current one partly measured, still ≈). The values are in the table below. -->
      <div class="spark" bind:clientWidth={width}>
        <svg viewBox="0 0 {SW} {SH}" width={SW} height={SH} aria-hidden="true">
          <!-- The scale starts at zero: the baseline says so, so a level year reads level. -->
          <line class="zero" x1="0" x2={SW} y1={SH - 0.5} y2={SH - 0.5} />
          <polyline class="proj" {points} style:stroke={SERIES.home} />
          <!-- The current month (the first point, partly measured). -->
          <circle class="now" cx="2" cy={y(values[0])} r="2.5" style:fill={SERIES.home} />
        </svg>
        <div class="spark-ends" aria-hidden="true"><span>{monthShort(months[0].key)}</span><span>{monthShort(months[months.length - 1].key)}</span></div>
      </div>
      <div class="visually-hidden"><table>
        <caption>{m.projection.monthsCaption}</caption>
        <thead><tr><th scope="col">{m.projection.monthCol}</th><th scope="col">{m.projection.value}</th></tr></thead>
        <tbody>
          {#each months as x (x.key)}
            <tr><th scope="row">{monthName(`${x.key}-01`)}</th><td>{m.projection.approx(euros ? fmtEurHero(x.eur) : fmtKwhHero(x.kwh))}</td></tr>
          {/each}
        </tbody>
      </table></div>
    {/if}
    <Disclosure title={m.projection.how} meta={m.energyUi.projectionMeta} detail class="more">
      <p class="muted note est">{m.projection.estimate}</p>
      <ul class="how">
        <li class="num">{m.projection.base(fmtKwhExact(r.per_day_kwh), last ? fmtDay(last) : null)}, {m.projection.method[r.method]}.</li>
        {#if r.price_eur_kwh != null}<li class="num">{m.projection.price(fmtPrice(r.price_eur_kwh), fmtDay(addDays(r.from, -1)))}.</li>{/if}
        {#if pm.method === 'weather'}
          <!-- Plan 15: the month end from the weather (observed, forecast, seasonal normals) with its 8-in-10 range. -->
          {#each projectionLines(pm.weather, pm.eur != null) as l, i (i)}<li class="num">{l}</li>{/each}
        {:else}
          <li>{m.projection.monthHow}.</li>
          {#each projectionLines(pm.weather, pm.eur != null) as l, i (i)}<li class="muted">{l}</li>{/each}
        {/if}
        {#if r.eur != null}<li>{m.projection.subscription}</li>{/if}
      </ul>
    </Disclosure>
  {/if}
</section>

<style>
  .by {
    font-size: 13px;
    font-weight: 400;
  }
  .covers {
    font-size: 12px;
    margin: -4px 0 10px;
  }
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
  .panel :global(.disclosure.more) {
    margin-top: 8px;
    border-top: 1px solid var(--line);
  }
  .how {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--mu);
  }
  .how li + li {
    margin-top: 2px;
  }
</style>
