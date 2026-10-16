<!-- Maison overview (direction-2 §3, UX batch 8): an overview, not a form. What happens now (absence, temporary
     heating) with its actions, the alerts when there are some, then one card per section that summarises its
     state and leads to its page (Pièces et appareils, Tarif, Linky, Sources de données, Compte), and the
     Affichage card set in place. The old section anchors land on their new place (`homeAnchor`). -->
<script lang="ts">
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import type { LinkyStatus, SessionInfo, SettingsView, Sources } from '$lib/api/types';
  import { alertText } from '$lib/alerts-text';
  import AlertList from '$lib/components/AlertList.svelte';
  import CozytouchStatus from '$lib/components/CozytouchStatus.svelte';
  import Freshness from '$lib/components/Freshness.svelte';
  import HomeCard from '$lib/components/HomeCard.svelte';
  import HouseActions from '$lib/components/HouseActions.svelte';
  import HoursBar from '$lib/components/HoursBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Swatch from '$lib/components/Swatch.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import { canEditSetup } from '$lib/capabilities';
  import { fmtAgo, fmtEurExact, fmtPrice, fmtTemp, fmtTime, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { LOCALE_NAMES, LOCALES, locale, m, setLocale } from '$lib/i18n';
  import { linkyFresh, linkyLine, linkyProblem } from '$lib/linky';
  import { desktop } from '$lib/media.svelte';
  import { navAlerts } from '$lib/navAlerts';
  import { ANCHORS, homeAnchor, ROUTES } from '$lib/paths';
  import { lateCount, sourceRows } from '$lib/sources';
  import { roomName } from '$lib/setup';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { detail } from '$lib/stores/detail.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { theme, type ThemeChoice } from '$lib/stores/theme';
  import { inForce, RATE_KEYS, slotsText } from '$lib/tariff';
  import { VERSION } from '$lib/version';

  // An old anchor (/home#tariff, #linky, #sessions) lands on its page; #away opens the sheet here.
  let leaving = $state(typeof location !== 'undefined' && !!homeAnchor(location.hash) && homeAnchor(location.hash) !== 'away');
  function land(hash: string) {
    const target = homeAnchor(hash);
    if (!target) return;
    if (target === 'away') {
      replaceState(ROUTES.home, {});
      awaySheet.show();
      return;
    }
    leaving = true;
    void goto(target, { replaceState: true });
  }
  afterNavigate(({ to }) => land(to?.url.hash ?? ''));
  // A hash typed or followed while already on Maison is not a navigation for the router.
  $effect(() => {
    const on = () => land(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  });

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  // The cards' summaries: each its own answer; a failure says « indisponible » in its card (the page retries).
  let settings = $state<SettingsView | null | undefined>(undefined);
  let linky = $state<LinkyStatus | null | undefined>(undefined);
  let grid = $state<Sources | null | undefined>(undefined);
  let sessions = $state<SessionInfo[] | null | undefined>(undefined);
  $effect(() => {
    api.settings().then((s) => (settings = s), () => (settings = null));
    api.linkyStatus().then((s) => (linky = s), () => (linky = null));
    api.status().then((s) => (grid = s.sources ?? null), () => (grid = null));
    api.sessions().then((s) => (sessions = s), () => (sessions = null));
  });

  // Everything below the header comes in one frame, once the house and the alerts are known: an alert's height
  // depends on how its text wraps (the font), so nothing already on screen is pushed down when it lands.
  let ready = $derived(house.loaded && alerts.answered);
  let shownAlerts = $derived((alerts.list ?? []).filter((a) => alertText(a) !== null));
  let alertsSection = $derived((alerts.error && alerts.list === null) || shownAlerts.length > 0);

  let dot = $derived(navAlerts(alerts.summary, alerts.list));
  let stateText = $derived(
    [dot.count ? m.home.stateAlerts(dot.count) : null, house.away ? m.home.stateAway(fmtWeekdayTime(house.away.ends_at * 1000)) : null]
      .filter(Boolean)
      .join(' · ') || m.home.allGood
  );

  const roomsOf = (ids: string[]) =>
    house.rooms.filter((r) => r.radiator_ids.some((i) => ids.includes(i))).map((r) => roomName(r)).join(', ') || m.home.wholeHome;
  /** « 21:45 » today, « dim. 18:00 » another day. */
  const endText = (ms: number) => (parisTodayIso(ms) === parisTodayIso(now) ? fmtTime(ms) : fmtWeekdayTime(ms));
  let offlineRooms = $derived(
    house.rooms.filter((r) => r.radiator_ids.length && house.roomRadiators(r.id).every((x) => x.reachable === false)).map((r) => roomName(r))
  );

  // Cards.
  let radiatorCount = $derived(Object.keys(house.radiators).length);
  let devicesSummary = $derived(m.home.cardDevices(house.rooms.length, radiatorCount));
  let tariffRow = $derived(settings?.tariff ? inForce(settings.tariff.prices, parisTodayIso(now)) : null);
  let tariffSlots = $derived.by(() => {
    const t = settings?.tariff;
    if (!t || tariffRow?.option !== 'hchp') return null;
    const s = inForce(t.hc_schedules, parisTodayIso(now));
    if (!s) return null;
    const month = Number(parisTodayIso(now).slice(5, 7));
    return (s.variants.find((v) => v.months.includes(month)) ?? s.variants[0])?.slots ?? null;
  });
  let tariffSummary = $derived(
    settings === undefined
      ? null
      : settings === null
        ? m.home.unavailable
        : !settings.tariff || !tariffRow
          ? m.home.cardTariffNone
          : m.home.cardTariff(m.tariff.options[tariffRow.option], m.tariff.kvaValue(settings.tariff.kva), fmtEurExact(tariffRow.subscription_eur_month))
  );
  let linkySummary = $derived(
    linky === undefined ? null : linky === null ? m.home.unavailable : linky.state === 'off' ? m.home.cardLinkyOff : (linkyProblem(linky) ?? linkyLine(linky) ?? '—')
  );
  let sources = $derived(
    grid === undefined || linky === undefined ? null : sourceRows({ status: house.status, live: house.online, linky: linky ?? null, grid: grid ?? null }, now)
  );
  let late = $derived(sources ? lateCount(sources) : 0);
  let sourcesSummary = $derived(sources === null ? null : late ? m.home.cardSourcesLate(late) : m.home.cardSourcesOk);
  let accountSummary = $derived(auth.email ?? '—');
  let accountLine = $derived(
    [auth.server?.name ?? null, sessions ? m.home.cardSessions(sessions.length) : null].filter(Boolean).join(' · ')
  );

  // Affichage.
  let themeChoice = $state<ThemeChoice>(theme.get());
  const THEMES: ThemeChoice[] = ['system', 'dark', 'light'];
  function setTheme(v: ThemeChoice) {
    themeChoice = v;
    theme.set(v);
  }
</script>

<svelte:head><title>{m.page.title(m.nav.home)}</title></svelte:head>

{#if !leaving}
<div class="head">
<PageHeader title={m.nav.home}>
  {#snippet actions()}
    {#if desktop.matches}
      <button type="button" class="btn" class:cool={!!house.away} onclick={(e) => awaySheet.show(e.currentTarget)}><Icon name="away" size={16} />{house.away
          ? m.away.short(fmtWeekdayTime(house.away.ends_at * 1000))
          : m.away.open}</button>
    {/if}
  {/snippet}
  {#snippet stateLine()}
    {#if ready}<p class="state">{stateText}</p>{:else}<p class="state"><span class="skeleton line-sk" aria-hidden="true"></span></p>{/if}
  {/snippet}
</PageHeader>
</div>

{#if !ready}
  <div class="page" aria-busy="true">
    <div class="skeleton now-sk" aria-hidden="true"></div>
    <div class="cards-wrap"><div class="cards">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="skeleton card-sk" aria-hidden="true"></div>{/each}
    </div></div>
  </div>
{:else}
  <div class="page">
    <section class="panel now" aria-labelledby="now-title">
      <h2 id="now-title" class="sl">{m.home.now}</h2>
      {#if house.overrides.length}
        <ul class="overrides">
          {#each house.overrides as o (o.id)}
            {@const end = endText(o.ends_at * 1000)}
            <li class="orow">
              <span class="glyph {o.kind}" aria-hidden="true"><Icon name={o.kind === 'away' ? 'away' : 'flame'} size={16} /></span>
              <div class="otext">
                {#if o.kind === 'away'}
                  <span><strong class="cool">{m.home.kind.away}</strong> · {m.home.tempUntil(fmtTemp(o.temperature), end)}</span>
                  <small>{o.restoring ? m.home.restoring : offlineRooms.length ? m.home.everyRoomBut(offlineRooms) : m.home.everyRoom}</small>
                {:else}
                  <span><strong class="warm">{m.home.kind.boost}</strong> · {roomsOf(o.radiator_ids)} · {m.home.tempUntil(fmtTemp(o.temperature), end)}</span>
                  <small>{o.restoring ? m.home.restoring : m.home.thenBack}</small>
                {/if}
              </div>
              <button type="button" class="btn btn-sm" aria-disabled={!house.online}
                aria-label={o.kind === 'away' ? m.home.endAwayLabel : m.home.stopLabel(roomsOf(o.radiator_ids))}
                onclick={() => house.online && run(() => api.cancelOverride(o.id))}>{o.kind === 'away' ? m.home.end : m.home.stop}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="nothing">{m.home.nothing}</p>
      {/if}
      <div class="qa">
        <HouseActions program away={!desktop.matches} awayText={m.away.open} stacked={!desktop.matches} />
      </div>
    </section>

    {#if alertsSection}
      <section id={ANCHORS.alerts} class="alerts" aria-labelledby="alerts-title">
        <h2 id="alerts-title" class="sl">{m.alerts.title}</h2>
        <AlertList />
      </section>
    {/if}

    <div class="cards-wrap">
      <div class="cards">
        <div class="list">
        <HomeCard href={ROUTES.devices} title={m.devices.title} summary={devicesSummary} vt="home-devices">
          {#if offlineRooms.length}<p>{m.home.cardDevicesOff(offlineRooms.length)}</p>{/if}
          {#if auth.server && !canEditSetup(auth.server)}<p>{m.home.readOnlyServer}</p>{/if}
          {#snippet foot()}<CozytouchStatus {now} />{/snippet}
        </HomeCard>
        <HomeCard href={ROUTES.tariff} title={m.tariff.title} summary={tariffSummary} vt="home-tariff">
          {#if tariffRow}
            <p class="prices">
              {#each RATE_KEYS[tariffRow.option].slice(0, tariffRow.option === 'tempo' ? 0 : 2) as k (k)}
                <span class="price">{#if k === 'hc' || k === 'hp'}<Swatch series={k} size={8} />{/if}{tariffRow.option === 'base'
                    ? fmtPrice(tariffRow.rates[k])
                    : `${m.tariff.rateShort[k]} ${fmtPrice(tariffRow.rates[k])}`}</span>
              {/each}
              {#if tariffRow.option === 'tempo'}<span>{m.home.cardTempo}</span>{/if}
            </p>
            {#if tariffSlots}<HoursBar slots={tariffSlots} compact label={m.tariffSummary.hoursLabel(slotsText(tariffSlots))} />{/if}
          {:else if settings && !settings.tariff}
            <p>{m.home.cardTariffSet}</p>
          {/if}
        </HomeCard>
        <HomeCard href={ROUTES.linky} title="Linky" summary={linkySummary} vt="home-linky">
          {#snippet mark()}{#if linky}<Freshness state={linkyFresh(linky, now)} />{/if}{/snippet}
          {#if linky && linky.state !== 'off'}<p>{m.home.cardLinkyWhat}</p>{/if}
          {#if linky?.last_ok_at}<p class="small">{m.linky.sync(fmtAgo(linky.last_ok_at * 1000, now))}</p>{/if}
        </HomeCard>
        <HomeCard href={ROUTES.sources} title={m.sources.title} summary={sourcesSummary} vt="home-sources">
          {#if sources}
            <p class="marks">{#each sources as s (s.key)}<span><Freshness state={s.state} />{s.name}</span>{/each}</p>
          {/if}
        </HomeCard>
        <HomeCard href={ROUTES.account} title={m.account.title} summary={accountSummary} vt="home-account">
          {#if accountLine}<p>{accountLine}</p>{/if}
        </HomeCard>
        </div>
        <section class="panel display" aria-labelledby="display-title">
          <h2 id="display-title" class="sl">{m.home.display}</h2>
          <div class="setrow">
            <span class="lbl">{m.settings.theme}</span>
            <Segmented options={THEMES.map((t) => ({ value: t, label: m.settings.themes[t] }))} value={themeChoice} label={m.settings.theme}
              onchange={setTheme} />
          </div>
          <div class="setrow">
            <span class="lbl">{m.settings.language}</span>
            <Segmented options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], lang: l }))} value={locale.current} label={m.settings.language}
              onchange={setLocale} />
          </div>
          <div class="detail-pref">
            <Toggle checked={detail.on} label={m.detail.label} onchange={(v) => detail.set(v)} />
            <p class="hint">{m.detail.hint}</p>
          </div>
        </section>
      </div>
    </div>

    <p class="ver mono">Kelvin {VERSION}</p>
  </div>
{/if}
{/if}

<style>
  /* The header (and « Partir en absence… ») ends where the content column does. */
  .head {
    max-width: 1080px;
  }
  .page {
    display: grid;
    gap: 14px;
    max-width: 1080px;
    min-width: 0;
  }
  .state {
    margin: 0;
    height: 19px;
    font-size: 13px;
    line-height: 19px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-sk {
    display: inline-block;
    width: 9rem;
    height: 13px;
    border-radius: 4px;
    vertical-align: -2px;
  }
  .now-sk {
    height: 96px;
    border-radius: var(--radius);
  }
  .card-sk {
    min-height: 132px;
    border-radius: var(--radius);
  }
  .cool {
    color: var(--cool);
  }
  .warm {
    color: var(--warm);
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
  }
  .sl {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  .overrides {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .orow {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    font-size: 14px;
  }
  .orow:first-child {
    padding-top: 0;
  }
  .glyph {
    display: inline-flex;
    align-self: start;
    padding-top: 2px;
  }
  .glyph.away {
    color: var(--cool);
  }
  .glyph.boost {
    color: var(--warm);
  }
  .otext {
    display: grid;
    gap: 1px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .otext strong {
    font-weight: 600;
  }
  .otext small {
    font-size: 12px;
    color: var(--mu);
  }
  .nothing {
    margin: 0;
    font-size: 13px;
    color: var(--mu);
  }
  .qa {
    margin-top: 12px;
  }
  .alerts {
    min-width: 0;
  }
  .alerts .sl {
    margin-bottom: 8px;
  }
  .cards-wrap {
    container: home-cards / inline-size;
    min-width: 0;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .prices {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    margin: 0;
    color: var(--tx);
    font-variant-numeric: tabular-nums;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 0;
  }
  .marks span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .small {
    font-size: 12px;
  }
  .cards :global(.more p) {
    margin: 0;
  }
  .display {
    display: grid;
    align-content: start;
    gap: 2px;
  }
  .display .sl {
    margin-bottom: 4px;
  }
  .setrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    min-height: 44px;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .lbl {
    font-weight: 500;
  }
  .detail-pref .hint {
    margin: -6px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .ver {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--mu);
    text-align: center;
  }
  .list {
    display: contents;
  }
  /* The list form: one grouped panel of 64 px rows (iOS-settings density), then Affichage on its own. */
  @container home-cards (max-width: 719px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
    .list {
      display: grid;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--s1);
      overflow: hidden;
    }
    .list > :global(.hcard:not(:last-child)) {
      border-bottom: 1px solid var(--line);
    }
    .card-sk {
      min-height: 64px;
    }
  }
</style>
