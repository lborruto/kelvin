<!-- Énergie › « Météo et coût » (Plan 15, spec §7.1): the 7-day strip, three figures (baseload, per °C colder, share
     due to the cold), the scatter with its kWh · € chips and legend, and « Comment c’est calculé ». Hidden model: the
     title and its reason with counts, the strip's temperatures, the measured dots. Loading: skeletons at the final
     height (CLS). Every figure is a Fig with the « calculé » Provenance; an « estimation » tag says when it is thin. -->
<script lang="ts">
  import type { WeatherCost } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { provenance } from '$lib/provenance';
  import type { ScatterMode } from '$lib/scatter';
  import { ATTRIBUTION_URL } from '$lib/weather';
  import { figures, houseWhy, methodLines, thinText } from '$lib/weatherCost';
  import Disclosure from './Disclosure.svelte';
  import Fig from './Fig.svelte';
  import ForecastStrip from './ForecastStrip.svelte';
  import Segmented from './Segmented.svelte';
  import Skeleton from './Skeleton.svelte';
  import WeatherScatter from './WeatherScatter.svelte';
  import Widget from './Widget.svelte';

  interface Props {
    /** `undefined` while loading, `null` when the call failed. */
    model: WeatherCost | null | undefined;
    /** The selected period in words (« octobre »): the share's sub-line. */
    periodName: string;
    /** The home has a tariff: the € chip is offered (with the model's price). */
    tariff: boolean;
    onretry?: (() => void) | null;
  }
  let { model, periodName, tariff, onretry = null }: Props = $props();

  const KEY = 'kelvin.weatherCost.mode'; // i18n-ignore: a storage key
  function stored(): ScatterMode {
    try {
      return sessionStorage.getItem(KEY) === 'eur' ? 'eur' : 'kwh';
    } catch {
      return 'kwh';
    }
  }
  let chosen = $state<ScatterMode>(stored());
  function setMode(v: ScatterMode) {
    chosen = v;
    try {
      sessionStorage.setItem(KEY, v);
    } catch {
      /* private mode: the choice lasts the page */
    }
  }
  let priced = $derived(tariff && !!model?.price);
  let mode = $derived<ScatterMode>(priced ? chosen : 'kwh');
  let height = $derived(desktop.matches ? 260 : 200);
  let figs = $derived(model ? figures(model, periodName) : null);
  let why = $derived(model ? houseWhy(model.house) : null);
  let thin = $derived(model && model.house.state === 'ok' ? thinText(model.house.thin, model.house.fit_days, model.house.heating_days) : null);
  let prov = $derived(model ? provenance('weather-model', { at: model.computed_at * 1000 }) : null);
  let off = $derived(model?.house.why === 'weather_off');
</script>

{#snippet estimate()}
  <span class="tag">{m.weatherCost.estimate}</span><span class="aside-text">{m.weatherCost.aside}</span>
{/snippet}

<Widget title={m.weatherCost.title} level="h2" aside={m.weatherCost.aside} meta={thin ? estimate : undefined} id="weather-cost"
  class="wide weather-cost">
  {#if model === undefined}
    <div class="sk" aria-hidden="true">
      <Skeleton h={18} w="40%" shape="line" />
      <Skeleton h={64} />
      <Skeleton h={72} />
      <Skeleton h={height + 40} />
      <Skeleton h={44} />
    </div>
  {:else if model === null}
    <p class="muted failed">{m.weatherCost.failed}
      {#if onretry}<button type="button" class="btn btn-sm" onclick={onretry}>{m.common.retry}</button>{/if}</p>
  {:else if off}
    <p class="muted">{why}</p>
  {:else}
    {#if thin}<p class="thin muted"><span aria-hidden="true">ⓘ</span> {thin}</p>{/if}
    {#if model.forecast.days.length}
      <h3 class="sub">{m.weatherCost.stripTitle}</h3>
      <ForecastStrip forecast={model.forecast} />
    {/if}
    {#if figs}
      <div class="figs">
        {#each figs as f (f.key)}
          <div class="figure">
            <span class="flbl">{f.label}</span>
            <Fig class="fval num" value={f.value} label="{f.label} {f.value}" title={f.label} rows={f.rows} provenance={prov}
              empty={f.rows.length ? null : f.sub} />
            <span class="fsub muted">{f.sub}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="why muted">{why}</p>
    {/if}
    {#if model.house.points.length}
      {#if priced}
        <div class="chips">
          <Segmented variant="chips" label={m.weatherCost.toggle} value={mode}
            options={[{ value: 'kwh', label: m.weatherCost.unitKwh }, { value: 'eur', label: m.weatherCost.unitEur }]}
            onchange={(v) => setMode(v as ScatterMode)} />
        </div>
      {/if}
      <WeatherScatter points={model.house.points} line={model.house.line} tb={model.house.balance_point_c} {mode} {height} />
      <ul class="legend">
        <li><span class="sw used" aria-hidden="true"></span>{m.weatherCost.legendUsed}</li>
        <li><span class="sw period" aria-hidden="true"></span>{m.weatherCost.legendPeriod}</li>
        <li><span class="sw excluded" aria-hidden="true"></span>{m.weatherCost.legendExcluded}</li>
        {#if model.house.line.length}<li><span class="sw model" aria-hidden="true"></span>{m.weatherCost.legendModel}</li>{/if}
      </ul>
      {#if mode === 'eur'}<p class="muted note">{m.weatherCost.eurLine}</p>{/if}
    {/if}
    <Disclosure title={m.weatherCost.details} meta={m.weatherCost.detailsMeta} detail class="more">
      <ul class="how">
        {#each methodLines(model) as l, i (i)}<li>{l}</li>{/each}
      </ul>
      <p class="attr"><a href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">{m.weather.attributionShort}</a></p>
    </Disclosure>
  {/if}
</Widget>

<style>
  .sk {
    display: grid;
    gap: 10px;
  }
  .muted {
    color: var(--mu);
  }
  .failed {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
  }
  .tag {
    font-size: 12px;
    color: var(--mu);
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: 999px;
    margin-right: 8px;
  }
  .aside-text {
    color: var(--mu);
  }
  .thin {
    margin: 0 0 10px;
    font-size: 13px;
  }
  .sub {
    margin: 0 0 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--mu);
  }
  /* The three figures: abreast on a wide panel, stacked on a phone; the hidden reason holds the same height. */
  .figs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 14px 0;
  }
  .figure {
    min-height: 72px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .flbl {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--mu);
  }
  .figure :global(.fval) {
    font-size: 20px;
    font-weight: 600;
    text-align: left;
  }
  .fsub {
    font-size: 12.5px;
  }
  .why {
    min-height: 72px;
    margin: 14px 0;
    font-size: 14px;
  }
  .chips {
    margin-bottom: 8px;
  }
  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 6px 0 0;
    padding: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .sw.used {
    background: var(--mu);
  }
  .sw.period {
    background: var(--tx);
  }
  .sw.excluded {
    border: 1px dashed var(--mu);
  }
  .sw.model {
    width: 14px;
    height: 8px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--tx) 10%, transparent);
    border-top: 1.5px solid var(--tx);
  }
  .note {
    margin: 6px 0 0;
    font-size: 12px;
  }
  .how {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: var(--mu);
    display: grid;
    gap: 4px;
  }
  .attr {
    margin: 8px 0 0;
    font-size: 12px;
  }
  .attr a {
    color: var(--mu);
  }
  @media (max-width: 640px) {
    .figs {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .figure {
      min-height: 0;
    }
  }
</style>
