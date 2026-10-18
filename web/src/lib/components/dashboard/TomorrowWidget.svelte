<!-- « Demain » (Tableau §4 energy column): with a weather place, tomorrow's heating cost from the weather model (Plan 15,
     spec §7.4: « 2,0 °C → ~6,28 € de chauffage », a Fig with kWh and € ranges, « — » with its reason); tomorrow's
     EcoWatt signal (every household) and, only when Tempo is the price row in force, tomorrow's Tempo colour. A signal
     not published yet says so, never a guess. The weather line's height is held while it loads (CLS). -->
<script lang="ts">
  import type { GridView, WeatherCostForecastView } from '$lib/api/types';
  import { fmtTemp, fmtWeekdayDay } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ecowattTomorrow } from '$lib/dashboard';
  import { provenance } from '$lib/provenance';
  import { ATTRIBUTION_URL } from '$lib/weather';
  import { forecastRows, tomorrowDay, tomorrowLine, tomorrowWhy } from '$lib/weatherCost';
  import Fig from '../Fig.svelte';
  import Icon from '../Icon.svelte';
  import Skeleton from '../Skeleton.svelte';
  import TempoDot from '../TempoDot.svelte';
  import Widget from '../Widget.svelte';

  interface Props {
    grid: GridView | null;
    todayIso: string;
    compact?: boolean;
    /** Plan 15: tomorrow's forecast with the house model (`undefined` while loading). */
    forecast?: WeatherCostForecastView | null;
    /** A weather place is set: the line is shown, or its place held while it loads. */
    weatherOn?: boolean;
  }
  let { grid, todayIso, compact = false, forecast = undefined, weatherOn = false }: Props = $props();
  let day = $derived(forecast ? tomorrowDay(forecast.forecast) : null);
  let line = $derived(forecast ? tomorrowLine(forecast.forecast) : null);
  let why = $derived(forecast === null ? m.weatherCost.failed : line ? null : (tomorrowWhy(forecast) ?? m.weatherCost.why.no_forecast));
  let title = $derived(day ? `${m.maison.tomorrow} · ${fmtWeekdayDay(day.date)}${day.t_c != null ? ` · ${fmtTemp(day.t_c)}` : ''}` : m.maison.tomorrow);
  let prov = $derived(
    forecast ? provenance('weather-forecast', { at: forecast.forecast.fetched_at != null ? forecast.forecast.fetched_at * 1000 : null }) : null
  );
  let eco = $derived(ecowattTomorrow(grid, todayIso));
  let tempo = $derived(grid?.tempo ? grid.tempo.tomorrow.colour : undefined);
  let expectedAt = $derived(grid?.tempo?.tomorrow.expected_at ?? null);
</script>

<Widget title={m.maison.tomorrow} pad={compact ? 'sm' : 'md'}>
  {#if tempo !== undefined}
    <p class="line"><TempoDot colour={tempo} /><b>{tempo ? m.maison.tempo(m.grid.colour[tempo]) : m.maison.tempo('—')}</b></p>
    {#if !tempo}<p class="sub">{m.maison.tempoPending(expectedAt)}</p>{/if}
  {/if}
  {#if eco}
    <p class="line" class:bad={eco.level >= 3}><Icon name="alert" size={15} /><b>{m.maison.ecowatt(eco.level)}</b></p>
    <p class="sub">{m.maison.ecowattTense(eco.hours, eco.level)}</p>
  {:else}
    <p class="line"><Icon name="alert" size={15} /><b>EcoWatt</b></p><!-- i18n-ignore: brand name -->
    <p class="sub">{m.maison.ecowattUnknown}</p>
  {/if}
  <!-- Plan 15: last, so a place saved while Maison is open never moves Tempo and EcoWatt. -->
  {#if weatherOn}
    <p class="line wline" class:compact>
      <Icon name="weather" size={15} />
      {#if forecast === undefined}<Skeleton h={14} w="70%" shape="line" />
      {:else}<Fig class="wfig" value={line ?? '—'} {title} rows={day && line ? forecastRows(day) : []} empty={why} provenance={prov}
          link={{ label: m.weather.attributionShort, href: ATTRIBUTION_URL }} />{/if}
    </p>
  {/if}
</Widget>

<style>
  p {
    margin: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: 15px;
  }
  .line + .line {
    margin-top: 4px;
  }
  /* The weather line holds one line (two in the compact pair) whether loading, shown or « — »: no shift (CLS). */
  .wline {
    height: 20px;
    overflow: hidden;
  }
  .wline.compact {
    height: 40px;
    align-items: flex-start;
  }
  .wline :global(.wfig) {
    min-width: 0;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wline.compact :global(.wfig) {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .line :global(svg) {
    flex: none;
    color: var(--mu);
  }
  .line.bad,
  .line.bad :global(svg) {
    color: var(--bad);
  }
  b {
    font-weight: 600;
  }
  .sub {
    margin-top: 2px;
    color: var(--mu);
    font-size: 13px;
  }
</style>
