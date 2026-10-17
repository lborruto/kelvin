<!-- Réglages › Météo's body (Plan 14, spec §7.1). Off: a lead, what leaves Kelvin (Notice), the town search
     (PlaceSearch) and « Utiliser des coordonnées » (a Disclosure with latitude, longitude and an optional
     altitude, read in either decimal mark). On: the place as a grouped list of facts (Lieu, Coordonnées,
     Altitude, Modèle, Historique, Appels aujourd’hui, Dernier relevé with its Freshness, kept current by the SSE
     `weather` event), « Changer de lieu » (the search again) and « Supprimer » (danger), which asks in a Sheet
     with Annuler focused. The attribution closes the page in both states. It reports the header's state line
     through `onstate` (null while loading keeps the line's height). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { api } from '$lib/api/client';
  import type { WeatherLocationBody, WeatherPlace, WeatherSettings } from '$lib/api/types';
  import { fmtCoord, fmtDateLong, fmtInt, fmtMetres, fmtTime, parseDecimal } from '$lib/format';
  import { errorText, locale, m } from '$lib/i18n';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { weather } from '$lib/stores/weather.svelte';
  import { ATTRIBUTION_URL, GEONAMES_URL, placeLine, weatherFresh } from '$lib/weather';
  import Disclosure from '../Disclosure.svelte';
  import Freshness from '../Freshness.svelte';
  import GroupedList from '../GroupedList.svelte';
  import Notice from '../Notice.svelte';
  import Sheet from '../Sheet.svelte';
  import PlaceSearch from './PlaceSearch.svelte';

  interface Props {
    /** The header's state line: « Lyon · Rhône · 173 m · relevé 14:17 » | « Désactivée »; null while loading. */
    onstate?: (s: string | null) => void;
  }
  let { onstate }: Props = $props();
  const uid = $props.id();

  let settings = $state<WeatherSettings | null | undefined>(undefined);
  let failed = $state(false);
  let busy = $state(false);
  let changing = $state(false);
  let coordsOpen = $state(false);
  let lat = $state('');
  let lon = $state('');
  let alt = $state('');
  let formError = $state<(() => string) | null>(null);
  let asking = $state(false);
  let cancel = $state<HTMLButtonElement>();
  let now = $state(Date.now());

  function load() {
    failed = false;
    api.weatherSettings().then(
      (s) => (settings = s),
      () => {
        settings = null;
        failed = true;
      }
    );
  }
  $effect(() => load());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  let loc = $derived(settings?.location ?? null);
  let placeName = $derived(loc ? (loc.name ? placeLine(loc) : m.weather.manualName(fmtCoord(loc.lat), fmtCoord(loc.lon))) : null);
  let fetchedAt = $derived(weather.view?.fetched_at ? weather.view.fetched_at * 1000 : null);
  let history = $derived.by(() => {
    const c = settings?.coverage;
    return c?.first_day && c.first_day <= c.from ? m.weather.historySince(fmtDateLong(c.first_day)) : m.weather.historyRunning;
  });
  let stateLine = $derived(
    settings === undefined ? null : !loc || !placeName ? m.weather.off : m.weather.state(placeName, fetchedAt ? fmtTime(fetchedAt) : null)
  );
  $effect(() => onstate?.(stateLine));

  async function save(body: WeatherLocationBody) {
    if (busy) return;
    busy = true;
    formError = null;
    try {
      settings = await api.putWeather(body);
      changing = false;
      coordsOpen = false;
      lat = lon = alt = '';
      toasts.push(() => m.weather.saved, 'info');
    } catch (e) {
      formError = () => errorText(e);
    } finally {
      busy = false;
    }
  }

  function pick(p: WeatherPlace) {
    void save({ ...p, origin: 'search' });
  }

  /** A signed decimal in either mark (« −1,55 », “-1.55”); null when it is not one. */
  function signed(s: string): number | null {
    const t = s.trim();
    const neg = /^[-−]/.test(t);
    const v = parseDecimal(neg ? t.slice(1) : t);
    return v == null ? null : neg ? -v : v;
  }

  function submitCoords(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const la = signed(lat);
    const lo = signed(lon);
    const el = alt.trim() ? signed(alt) : null;
    if (la == null || lo == null || (alt.trim() && el == null)) {
      formError = () => m.weather.coordsInvalid;
      return;
    }
    void save({ lat: la, lon: lo, elevation_m: el == null ? null : Math.round(el), origin: 'manual' });
  }

  function ask() {
    if (busy) return;
    asking = true;
    void tick().then(() => cancel?.focus()); // the safe choice takes focus
  }

  async function remove() {
    asking = false;
    if (busy) return;
    busy = true;
    try {
      await api.deleteWeather();
      weather.apply(null); // the SSE says the same a moment later
      settings = settings ? { ...settings, location: null, coverage: null } : settings;
      changing = false;
    } catch (e) {
      toasts.push(() => errorText(e));
    } finally {
      busy = false;
    }
  }
</script>

{#snippet search()}
  <PlaceSearch onpick={pick} lang={locale.current} autofocus={changing} />
{/snippet}

{#snippet attribution()}
  <p class="note attribution">
    {m.weather.attribution}
    <a href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> ·
    <a href={GEONAMES_URL} target="_blank" rel="noopener noreferrer">GeoNames</a>
  </p>
{/snippet}

{#if settings === undefined}
  <div class="sk" aria-busy="true">
    <div class="skeleton sk-line head-sk" aria-hidden="true"></div>
    <div class="skeleton" style:height="364px" aria-hidden="true"></div>
  </div>
{:else if failed || !settings}
  <div class="notice bad fail" role="alert">
    <p>{m.weather.loadFailed}</p>
    <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button>
  </div>
{:else if !loc}
  <section class="off">
    <p class="lead">{m.weather.lead}</p>
    <Notice title={m.weather.privacyTitle} icon="shield" role={null}>{m.weather.privacy}</Notice>
    <div class="grp pad">{@render search()}</div>
    {#if formError && !coordsOpen}<p class="error" role="alert">{formError()}</p>{/if}
    <section class="grp coords">
      <Disclosure title={m.weather.useCoords} heading="h2" bind:open={coordsOpen}>
        <form class="form" onsubmit={submitCoords} novalidate>
          <div class="fields">
            <label class="field"><span>{m.weather.lat}</span>
              <input class="w-coord" inputmode="decimal" autocomplete="off" bind:value={lat}
                aria-invalid={formError ? 'true' : undefined} aria-describedby={formError ? `${uid}-err` : undefined} /></label>
            <label class="field"><span>{m.weather.lon}</span>
              <input class="w-coord" inputmode="decimal" autocomplete="off" bind:value={lon}
                aria-invalid={formError ? 'true' : undefined} aria-describedby={formError ? `${uid}-err` : undefined} /></label>
            <label class="field"><span>{m.weather.elevation}</span>
              <input class="w-coord" inputmode="decimal" autocomplete="off" bind:value={alt}
                aria-describedby={formError ? `${uid}-err` : undefined} /></label>
          </div>
          {#if formError}<p class="error" id="{uid}-err" role="alert">{formError()}</p>{/if}
          <button type="submit" class="btn btn-primary" aria-disabled={busy}>{m.weather.save}</button>
        </form>
      </Disclosure>
    </section>
  </section>
{:else}
  <section class="on">
    <GroupedList tag="dl">
      <div class="li"><dt>{m.weather.place}</dt><dd>{placeName}</dd></div>
      <div class="li"><dt>{m.weather.coords}</dt><dd class="num">{m.weather.coordsValue(fmtCoord(loc.lat), fmtCoord(loc.lon))}</dd></div>
      <div class="li"><dt>{m.weather.elevationRow}</dt><dd class="num">{m.weather.elevationValue(fmtMetres(loc.elevation_m), m.weather.elevationFrom[loc.elevation_source] ?? '—')}</dd></div>
      <div class="li"><dt>{m.weather.modelRow}</dt><dd>{loc.mode === 'best_match' ? m.weather.modelBest : m.weather.modelMf}</dd></div>
      <div class="li"><dt>{m.weather.history}</dt><dd>{history}</dd></div>
      <div class="li"><dt>{m.weather.calls}</dt><dd class="num">{m.weather.callsValue(fmtInt(settings.calls_today), fmtInt(settings.budget))}</dd></div>
      <div class="li">
        <dt>{m.weather.lastRead}</dt>
        <dd class="num"><Freshness state={weatherFresh(weather.view, now)} />{fetchedAt ? fmtTime(fetchedAt) : '—'}</dd>
      </div>
    </GroupedList>
    {#if formError}<p class="error" role="alert">{formError()}</p>{/if}
    {#if changing}<div class="grp pad">{@render search()}</div>{/if}
    <div class="actions">
      {#if !changing}<button type="button" class="btn btn-ghost" onclick={() => (changing = true)}>{m.weather.change}</button>{/if}
      <button type="button" class="btn danger" aria-disabled={busy} onclick={ask}>{m.weather.remove}</button>
    </div>
  </section>
{/if}
{#if settings !== undefined}{@render attribution()}{/if}

<Sheet open={asking} title={m.weather.removeTitle} width={400} onclose={() => (asking = false)} noClose>
  <p class="body">{m.weather.removeBody}</p>
  {#snippet footer()}
    <div class="sheet-actions">
      <button type="button" class="btn" bind:this={cancel} onclick={() => (asking = false)}>{m.common.cancel}</button>
      <button type="button" class="btn btn-danger" onclick={remove}>{m.weather.remove}</button>
    </div>
  {/snippet}
</Sheet>

<style>
  section {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .lead {
    margin: 0;
    font-size: 15px;
  }
  .pad {
    padding: 12px 16px 14px;
  }
  .coords {
    padding: 0 16px;
  }
  /* The disclosure's heading holds its button: a 15 px row, not a page heading. */
  .coords :global(h2) {
    margin: 0;
    font-size: 15px;
    font-weight: 400;
  }
  .coords :global(h2 button) {
    min-height: 52px;
  }
  .form {
    display: grid;
    justify-items: start;
    gap: var(--ctl-gap);
    padding-bottom: 16px;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ctl-gap) 16px;
    width: 100%;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .w-coord {
    width: 9rem;
  }
  .li {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
    padding: 6px 0;
  }
  dt {
    color: var(--mu);
  }
  dd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: 600;
    min-width: 0;
    text-align: right;
  }
  .actions,
  .sheet-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sheet-actions {
    justify-content: flex-end;
  }
  .danger {
    color: var(--bad);
  }
  .error {
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }
  .body {
    margin: 0;
  }
  .note {
    margin: 8px 16px 0;
    font-size: 12px;
    color: var(--mu);
  }
  .attribution a {
    display: inline-block;
    padding-block: 12px;
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .head-sk {
    width: 7rem;
    height: 14px;
    margin: 18px 16px 8px;
  }
  .fail {
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
  .fail p {
    margin: 0;
    font-size: 14px;
  }
</style>
