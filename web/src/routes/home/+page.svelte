<!-- Réglages (Tableau §4 « Réglages », mockups 5 « Vue d’ensemble »; was « Maison » before the Tableau): an
     overview in cards on a wide screen (3 columns), a grouped list on a phone, one per subject (Pièces et
     appareils, Tarif, Linky, Sources de données, Compte), each with its state in one line and its freshness,
     then Affichage (Langue, Afficher les détails techniques; no theme: Kelvin is dark only) and the version.
     The alerts sit above the cards while there are some (#alerts). What happens now (absence, temporary
     heating) and the house actions live on the Maison tableau. The old section anchors land on their new place
     (`homeAnchor`; #away opens the Absence sheet here). -->
<script lang="ts">
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { api } from '$lib/api/client';
  import type { LinkyStatus, McpTokenList, SessionInfo, SettingsView, Sources } from '$lib/api/types';
  import { alertText } from '$lib/alerts-text';
  import AlertList from '$lib/components/AlertList.svelte';
  import CozytouchStatus from '$lib/components/CozytouchStatus.svelte';
  import HomeCard from '$lib/components/HomeCard.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SourceLine from '$lib/components/SourceLine.svelte';
  import Swatch from '$lib/components/Swatch.svelte';
  import TariffBand from '$lib/components/TariffBand.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { canEditSetup } from '$lib/capabilities';
  import { fmtAgo, fmtEurExact, fmtPrice, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { LOCALE_NAMES, LOCALES, locale, m, setLocale } from '$lib/i18n';
  import { linkyFresh, linkyLine, linkyProblem } from '$lib/linky';
  import { dayBlocks, hcText, offpeakSlots } from '$lib/maintenant';
  import { navAlerts } from '$lib/navAlerts';
  import { ANCHORS, homeAnchor, ROUTES } from '$lib/paths';
  import { lateCount, sourceRows } from '$lib/sources';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { detail } from '$lib/stores/detail.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { inForce, RATE_KEYS } from '$lib/tariff';
  import { VERSION } from '$lib/version';

  // An old anchor (/home#tariff, #linky, #sessions, #mcp) lands on its page; #away opens the sheet here.
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
  // A hash typed or followed while already on Réglages is not a navigation for the router.
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

  // The cards' summaries: each its own answer; a failure says « indisponible » in its card.
  let settings = $state<SettingsView | null | undefined>(undefined);
  let linky = $state<LinkyStatus | null | undefined>(undefined);
  let grid = $state<Sources | null | undefined>(undefined);
  let sessions = $state<SessionInfo[] | null | undefined>(undefined);
  let mcp = $state<McpTokenList | null | undefined>(undefined);
  $effect(() => {
    api.settings().then((s) => (settings = s), () => (settings = null));
    api.linkyStatus().then((s) => (linky = s), () => (linky = null));
    api.status().then((s) => (grid = s.sources ?? null), () => (grid = null));
    api.sessions().then((s) => (sessions = s), () => (sessions = null));
    // The token count only (the list is the Compte page's); never a secret.
    Promise.resolve()
      .then(() => api.mcpTokens())
      .then((t) => (mcp = t ?? null), () => (mcp = null));
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

  let offlineRooms = $derived(house.rooms.filter((r) => r.radiator_ids.length && house.roomRadiators(r.id).every((x) => x.reachable === false)));

  // Cards.
  let radiatorCount = $derived(Object.keys(house.radiators).length);
  let devicesSummary = $derived(m.home.cardDevices(house.rooms.length, radiatorCount));
  let today = $derived(parisTodayIso(now));
  let tariffRow = $derived(settings?.tariff ? inForce(settings.tariff.prices, today) : null);
  let tariffBlocks = $derived(settings?.tariff && tariffRow && tariffRow.option !== 'base' ? dayBlocks(offpeakSlots(settings.tariff, tariffRow, today)) : null);
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
  let activeTokens = $derived(mcp?.enabled ? mcp.tokens.filter((t) => t.revoked_at === null).length : null);
  let accountLine = $derived(
    [auth.server?.name ?? null, sessions ? m.home.cardSessions(sessions.length) : null, activeTokens ? m.home.cardMcp(activeTokens) : null]
      .filter(Boolean)
      .join(' · ')
  );
</script>

<svelte:head><title>{m.page.title(m.nav.home)}</title></svelte:head>

{#if !leaving}
<div class="page">
  <SettingsHeader title={m.nav.home} state={ready ? stateText : null} />

  {#if !ready}
    <div class="cards-wrap" aria-busy="true"><div class="cards">
      <div class="list">{#each [0, 1, 2, 3, 4] as i (i)}<div class="skeleton sk-widget card-sk" aria-hidden="true"></div>{/each}</div>
      <div class="skeleton sk-widget card-sk display-sk" aria-hidden="true"></div>
    </div></div>
  {:else}
    {#if alertsSection}
      <section id={ANCHORS.alerts} class="alerts" aria-labelledby="alerts-title">
        <div class="areah"><h2 id="alerts-title">{m.alerts.title}</h2></div>
        <AlertList />
      </section>
    {/if}

    <div class="cards-wrap">
      <div class="cards">
        <div class="list">
          <HomeCard href={ROUTES.devices} icon="grid" title={m.devices.title} summary={devicesSummary} vt="home-devices">
            {#if offlineRooms.length}<p>{m.home.cardDevicesOff(offlineRooms.length)}</p>{/if}
            {#if auth.server && !canEditSetup(auth.server)}<p>{m.home.readOnlyServer}</p>{/if}
            {#snippet foot()}<CozytouchStatus {now} />{/snippet}
          </HomeCard>
          <HomeCard href={ROUTES.tariff} icon="tag" title={m.tariff.title} summary={tariffSummary} vt="home-tariff">
            {#if tariffRow}
              <p class="prices">
                {#each RATE_KEYS[tariffRow.option].slice(0, tariffRow.option === 'tempo' ? 0 : 2) as k (k)}
                  <span class="price">{#if k === 'hc' || k === 'hp'}<Swatch series={k} size={10} />{/if}{tariffRow.option === 'base'
                      ? fmtPrice(tariffRow.rates[k])
                      : `${m.tariff.rateShort[k]} ${fmtPrice(tariffRow.rates[k])}`}</span>
                {/each}
                {#if tariffRow.option === 'tempo'}<span>{m.home.cardTempo}</span>{/if}
              </p>
            {:else if settings && !settings.tariff}
              <p>{m.home.cardTariffSet}</p>
            {/if}
            {#snippet foot()}
              {#if tariffBlocks}<TariffBand blocks={tariffBlocks} label={m.tariffSummary.hoursLabel(hcText(tariffBlocks))} ticks={false} height={8} />{/if}
            {/snippet}
          </HomeCard>
          <HomeCard href={ROUTES.linky} icon="meter" title="Linky" summary={linkySummary} vt="home-linky">
            {#if linky?.last_ok_at}<p>{m.linky.sync(fmtAgo(linky.last_ok_at * 1000, now))}</p>
            {:else if linky && linky.state !== 'off'}<p>{m.home.cardLinkyWhat}</p>{/if}
            {#snippet foot()}
              {#if linky && linky.state !== 'off'}<SourceLine source="Linky" text={linky.last_ok_at ? fmtAgo(linky.last_ok_at * 1000, now) : '—'} state={linkyFresh(linky, now)} />{/if}
            {/snippet}
          </HomeCard>
          <HomeCard href={ROUTES.sources} icon="sync" title={m.sources.title} summary={sourcesSummary} vt="home-sources">
            {#if sources}<p>{sources.map((s) => s.name).join(', ')}</p>{/if}
          </HomeCard>
          <HomeCard href={ROUTES.account} icon="user" title={m.account.title} summary={accountSummary} vt="home-account">
            {#if accountLine}<p>{accountLine}</p>{/if}
          </HomeCard>
        </div>
        <section class="display" aria-labelledby="display-title">
          <h2 id="display-title">{m.home.display}</h2>
          <div class="grp">
            <div class="li setrow">
              <span class="lbl">{m.settings.language}</span>
              <Segmented options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], lang: l }))} value={locale.current} label={m.settings.language}
                onchange={setLocale} />
            </div>
            <div class="li"><Toggle checked={detail.on} label={m.detail.label} onchange={(v) => detail.set(v)} /></div>
          </div>
          <p class="note">{m.detail.hint} {m.home.darkOnly}</p>
        </section>
      </div>
    </div>

    <p class="ver mono">Kelvin {VERSION}</p>
  {/if}
</div>
{/if}

<style>
  .page {
    display: grid;
    gap: 16px;
    max-width: 1080px;
    min-width: 0;
  }
  .page > :global(.sh) {
    margin-bottom: 6px;
  }
  .alerts {
    min-width: 0;
  }
  .cards-wrap {
    container: home-cards / inline-size;
    min-width: 0;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .list {
    display: contents;
  }
  .card-sk {
    min-height: 150px;
  }
  .prices {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    margin: 0;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .cards :global(.more p) {
    margin: 0;
  }
  /* Affichage: a card among the cards (wide), a grouped list of its own (phone). */
  .display {
    display: flex;
    flex-direction: column;
    min-height: 150px;
    padding: 18px 20px;
    border-radius: var(--r-widget);
    background: var(--s1);
    min-width: 0;
  }
  .display h2 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }
  .display .grp {
    padding: 0;
    background: none;
    border-radius: 0;
  }
  .display .li {
    min-height: 44px;
  }
  .setrow {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 12px;
  }
  .lbl {
    color: var(--mu);
    font-size: 14px;
  }
  .display :global(.toggle) {
    color: var(--mu);
    font-size: 14px;
  }
  .note {
    margin: 6px 0 0;
  }
  .ver {
    margin: 12px 0 0;
    font-size: 12px;
    color: var(--mu);
    text-align: center;
  }
  @container home-cards (max-width: 959px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* The list form: one grouped list of 64 px rows (iPhone Réglages density), then Affichage on its own. */
  @container home-cards (max-width: 719px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    .list {
      display: grid;
      padding: 0 16px;
      border-radius: var(--r-group);
      background: var(--s1);
    }
    .list > :global(.hcard:not(:first-child)) {
      border-top: 1px solid var(--line);
    }
    .list > .card-sk {
      min-height: 64px;
      border-radius: 0;
    }
    .display {
      min-height: 0;
      padding: 0;
      background: none;
      border-radius: 0;
    }
    .display h2 {
      margin: 18px 16px 6px;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mu);
    }
    .display .grp {
      padding: 0 16px;
      background: var(--s1);
      border-radius: var(--r-group);
    }
    .display .li {
      min-height: 52px;
    }
    .lbl,
    .display :global(.toggle) {
      color: var(--tx);
      font-size: 15px;
    }
    .note {
      margin: 6px 16px 0;
    }
    .display-sk {
      min-height: 160px;
      margin-top: 24px;
    }
  }
</style>
