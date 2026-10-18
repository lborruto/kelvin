<!-- « 7 prochains jours » (Plan 15, spec §7.1): one cell per forecast day — the day, its mean temperature and its
     heating € (or kWh without a price, or « — » with its reason) — each value a Fig whose Fiche gives min · max, the
     model and its assumed error, kWh and € with their 8-in-10 ranges and the Provenance (« projection »); then the
     week's sentence with its heating part matched. Cells have a fixed height (CLS); seven abreast, 4 + 3 when narrow,
     never a horizontal scroll. -->
<script lang="ts">
  import type { WeatherForecast } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import { ATTRIBUTION_URL } from '$lib/weather';
  import { forecastCell, forecastRows, weekLine } from '$lib/weatherCost';
  import Fig from './Fig.svelte';

  interface Props {
    forecast: WeatherForecast;
  }
  let { forecast }: Props = $props();
  let cells = $derived(forecast.days.map((d) => ({ d, c: forecastCell(d) })));
  let week = $derived(weekLine(forecast));
  let prov = $derived(provenance('weather-forecast', { at: forecast.fetched_at != null ? forecast.fetched_at * 1000 : null }));
</script>

<ul class="strip" aria-label={m.weatherCost.stripLabel}>
  {#each cells as { d, c } (d.date)}
    <li class="cell" aria-label="{c.day}, {c.temp}, {c.value}">
      <span class="day">{c.day}</span>
      <span class="temp num">{c.temp}</span>
      <Fig class="val num" value={c.value} title="{c.day} · {c.temp}" rows={forecastRows(d)} empty={c.value === '—' ? c.why : null}
        notes={c.why && c.value !== '—' ? [c.why] : []} provenance={prov} link={{ label: m.weather.attributionShort, href: ATTRIBUTION_URL }} />
    </li>
  {/each}
</ul>
{#if week}<p class="week num">{week}</p>{/if}

<style>
  .strip {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .cell {
    height: 64px;
    box-sizing: border-box;
    min-width: 0;
    padding: 5px 4px;
    border-radius: var(--radius);
    background: var(--s2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
  }
  .day {
    font-size: 12.5px;
    line-height: 15px;
    font-weight: 600;
    color: var(--mu);
    white-space: nowrap;
  }
  .temp {
    font-size: 15px;
    line-height: 19px;
    font-weight: 600;
    white-space: nowrap;
  }
  .cell :global(.val) {
    font-size: 12.5px;
    line-height: 17px;
    padding-bottom: 2px;
    color: var(--mu);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .week {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--mu);
  }
  /* A narrow panel: 4 + 3, never a scroll inside the strip. */
  @media (max-width: 480px) {
    .strip {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
