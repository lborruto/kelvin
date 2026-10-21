<!-- Maison, the dashboard at « / » (Tableau spec §4, fixed layout). Desktop: the title with the date and the house
     actions, the summary chips (Climat, the month, Réseau, Absence, then Dehors with a weather place), the alerts / « Tout est éteint » / absence
     widgets, then one column per room that answers (rows of two), the offline rooms' column, the « Énergie et
     réseau » column (month, Maintenant, Demain, Hier) and « Programme d’aujourd’hui » under the rooms. Phone: one
     column with two-column room tiles. Skeletons at the final shapes until the house, the alerts and the energy
     answers are in, then everything in one frame (CLS). After that frame the alerts the server raises or resolves
     are announced (a toast, « Mettre à jour » in the widget) and drawn when the owner asks, so a row never pushes
     the page (DESIGN « Maison »). The room sheet opens over it (`?sheet=<id>`, the root layout). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Room } from '$lib/api/types';
  import { alertText } from '$lib/alerts-text';
  import { roomControls } from '$lib/capabilities';
  import { fmtEurHero, fmtKwhHero, fmtTime, fmtWeekdayDate, fmtWeekdayTime, monthTitle } from '$lib/format';
  import { m } from '$lib/i18n';
  import {
    climate,
    climateText,
    gridNext,
    gridNextText,
    monthSpan,
    newAlerts,
    sameAlerts,
    type AlertsFrame,
    type RoomFacts
  } from '$lib/dashboard';
  import { desktop } from '$lib/media.svelte';
  import { ROUTES } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { isOffline, roomReading, roomStatus } from '$lib/status';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { grid } from '$lib/stores/grid.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { weather } from '$lib/stores/weather.svelte';
  import { chipValue, weatherFiche } from '$lib/weather';
  import { dashboardEnergy as energy } from '$lib/stores/dashboardEnergy.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { today } from '$lib/today.svelte';
  import HouseActions from '../HouseActions.svelte';
  import Icon from '../Icon.svelte';
  import MaintenantCard from '../MaintenantCard.svelte';
  import Skeleton from '../Skeleton.svelte';
  import SummaryChip from '../SummaryChip.svelte';
  import AlertsWidget from './AlertsWidget.svelte';
  import AllOffBanner from './AllOffBanner.svelte';
  import NowWidget from './NowWidget.svelte';
  import BillWidget from './BillWidget.svelte';
  import MaisonColumn from './MaisonColumn.svelte';
  import MaisonRoom from './MaisonRoom.svelte';
  import TodayProgram from './TodayProgram.svelte';
  import TomorrowWidget from './TomorrowWidget.svelte';
  import YesterdayWidget from './YesterdayWidget.svelte';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  $effect(() => {
    if (auth.loggedIn !== false && alerts.due && alerts.summary.active > 0) void alerts.load();
  });
  $effect(() => {
    if (house.loaded) energy.load(today.iso, untrack(() => weather.on));
  });
  // Plan 15: tomorrow's heating cost with a weather place; asked again on a new forecast (throttled in the store).
  // Another place (or none): tomorrow's line was the previous place's.
  let shownPlace = untrack(() => weather.place);
  $effect(() => {
    const p = weather.place;
    if (!house.loaded) return;
    const moved = p !== shownPlace;
    shownPlace = p;
    untrack(() => {
      if (moved || !weather.on) energy.clearForecast();
      if (weather.on) energy.loadForecast();
    });
  });
  $effect(() => {
    const at = weather.view?.fetched_at ?? null;
    untrack(() => energy.refreshForecast(at));
  });

  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  // Cozytouch order; rooms whose radiators are all offline (switched off at the mains: normal here) go last.
  let groups = $derived.by(() => {
    const on: Room[] = [];
    const off: Room[] = [];
    for (const r of house.rooms) (isOffline(house.roomRadiators(r.id)) ? off : on).push(r);
    return { on, off };
  });
  let offNames = $derived(groups.off.map((r) => roomName(r)));
  let facts = $derived(
    house.rooms.map((r): RoomFacts => {
      const rads = house.roomRadiators(r.id);
      const status = roomStatus(r, rads, house.overrideFor(r.id), house.roomExpected(r.id), now);
      return {
        reading: roomReading(r, rads),
        offline: status.kind === 'offline',
        heating: house.roomHeating(r.id) && status.kind !== 'off',
        controllable: roomControls(rads).controllable > 0,
        off: status.kind === 'off'
      };
    })
  );
  let c = $derived(climate(facts));
  const key = (id: string) => `${id}|day|${start}`;
  $effect(() => {
    if (!desktop.matches) return;
    for (const r of groups.on) history.load(key(r.id), r.radiator_ids, start, Math.min(end, now), 900);
  });

  // The alerts are drawn once known (an alert's height depends on its words): only waited for when there are some.
  let alertsReady = $derived(alerts.summary.active === 0 || alerts.answered);
  let ready = $derived(house.loaded && alertsReady && energy.answered);
  let month = $derived(energy.month && energy.month.linky ? energy.month : null);
  let span = $derived(monthSpan(today.iso));
  let monthValue = $derived(
    month ? (month.tariff && month.period.eur != null ? fmtEurHero(month.period.eur) : fmtKwhHero(month.period.kwh)) : ''
  );

  // The alerts on screen (CLS): those of the first frame, then only what the owner asks for (« Mettre à jour »,
  // the toast's « Afficher », a dismissal, Réessayer) or what changed while the tab was hidden. A row the server
  // adds or resolves later would push the rooms down or pull them up under the owner's finger (CI 2026-10-17:
  // an EcoWatt alert raised 1 s after the first frame moved the page 80 px at 320 px, CLS 0.052).
  const liveAlerts = (): AlertsFrame => ({
    list: (alerts.list ?? []).filter((a) => alertText(a) !== null),
    error: alerts.error && alerts.list === null
  });
  let drawnAlerts = $state<AlertsFrame | null>(null);
  let shownAlerts = $derived(drawnAlerts ?? liveAlerts());
  let alertsChanged = $derived(drawnAlerts !== null && !sameAlerts(drawnAlerts, liveAlerts()));
  const syncAlerts = () => (drawnAlerts = liveAlerts());
  $effect(() => {
    if (ready && drawnAlerts === null) untrack(syncAlerts);
  });
  // A new alert is announced once, with « Afficher »; the widget's « Mettre à jour » stays until it is drawn.
  const announced = new Set<number>();
  $effect(() => {
    if (drawnAlerts === null) return;
    const fresh = newAlerts(drawnAlerts, liveAlerts()).filter((a) => !announced.has(a.id));
    if (!fresh.length) return;
    for (const a of fresh) announced.add(a.id);
    untrack(() => toasts.push(() => m.maison.alertsNew(fresh.length), 'info', undefined, { label: () => m.maison.alertsShow, run: syncAlerts }));
  });
  $effect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden' && drawnAlerts !== null) syncAlerts();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  });

  let away = $derived(house.away);
  let awayUntil = $derived(away?.ends_at != null ? m.maison.awayUntil(fmtWeekdayTime(away.ends_at * 1000)) : m.maison.awayUntilReturn);
</script>

{#snippet chips(compact: boolean)}
  <div class="chip-row chips" role="group" aria-label={m.maison.chips}>
    <SummaryChip icon="flame" label={m.maison.climate} value={climateText(c, compact)} />
    {#if month}<SummaryChip icon="euro" label={monthTitle(span.from)} value={monthValue} href={ROUTES.energy} />{/if}
    <SummaryChip icon="alert" label={m.maison.grid} value={gridNextText(gridNext(grid.view, today.iso))} href={ROUTES.energy} />
    <SummaryChip icon="away" label={m.maison.away} value={away ? awayUntil : m.nav.away} tone={away ? 'cool' : null}
      onclick={(e) => awaySheet.show(e.currentTarget as HTMLElement)} />
    <!-- Plan 14: only with a place; its words are built here so a language switch rewords the Fiche. Last: its first
         reading (« — » → « 4,2 °C ») and a place saved elsewhere arrive over the SSE after the first frame, and a
         late chip moves no other chip from the end of the row (CLS, DESIGN « Maison »). -->
    {#if weather.view}<SummaryChip icon="weather" label={m.weather.chip} value={chipValue(weather.view)} fiche={weatherFiche(weather.view, now)} />{/if}
  </div>
{/snippet}

{#snippet notices(phone: boolean)}
  <AlertsWidget compact={phone} list={shownAlerts.list} error={shownAlerts.error} changed={alertsChanged} onsync={syncAlerts} />
  {#if c.allOff}<AllOffBanner offline={offNames} {phone} />{/if}
  {#if house.overrides.length}<NowWidget overrides={house.overrides} offline={offNames} {now} />{/if}
{/snippet}

{#snippet energyWidgets(phone: boolean)}
  {#if phone}
    <MaintenantCard tariff={energy.tariff ?? null} grid={grid.view} {now} />
    <div class="pair">
      {#if month}<BillWidget report={month} todayIso={today.iso} {now} compact />{/if}
      <TomorrowWidget grid={grid.view} todayIso={today.iso} compact forecast={energy.forecast} weatherOn={weather.on} />
    </div>
  {:else}
    <div class="egrid">
      {#if month}<BillWidget report={month} todayIso={today.iso} {now} span={2} />{/if}
      <MaintenantCard tariff={energy.tariff ?? null} grid={grid.view} {now} span={2} />
      <TomorrowWidget grid={grid.view} todayIso={today.iso} forecast={energy.forecast} weatherOn={weather.on} />
      {#if month}<YesterdayWidget report={energy.yesterday} curve={energy.curve} {now} />{/if}
    </div>
  {/if}
{/snippet}

<div class="maison">
  <header class="head">
    <div class="phone-actions"><HouseActions menu /></div>
    <div class="title">
      <h1 class="t-page">{m.nav.rooms}</h1>
      <p class="date">{m.maison.dateLine(fmtWeekdayDate(now), fmtTime(now))}</p>
    </div>
    <div class="desk-actions"><HouseActions maison allOff={ready && c.allOff} /></div>
  </header>

  {#if !ready}
    <div class="sk" aria-hidden="true">
      <div class="sk-chips">{#each weather.on ? [180, 120, 200, 120, 120] : [180, 120, 200, 120] as w, i (i)}<Skeleton h={46} w={w} shape="pill" />{/each}</div>
      {#if desktop.matches}
        <div class="board">
          <div class="left">
            <div class="rooms">
              {#each [0, 1] as i (i)}<div class="skcol"><Skeleton h={22} w={152} shape="line" /><Skeleton h={232} shape="widget" />
                  <div class="two"><Skeleton h={110} shape="tile" /><Skeleton h={110} shape="tile" /></div><Skeleton h={68} shape="tile" /></div>{/each}
            </div>
            <div class="skcol"><Skeleton h={22} w={120} shape="line" /><Skeleton h={150} shape="tile" /></div>
            <div class="wide"><Skeleton h={150} shape="widget" /></div>
          </div>
          <!-- With a place, Demain (beside Hier) holds its weather line: the pair is taller by it. -->
          <div class="skcol"><Skeleton h={22} w={196} shape="line" /><Skeleton h={128} shape="widget" /><Skeleton h={150} shape="widget" />
            <div class="two">{#each [0, 1] as i (i)}<Skeleton h={weather.on ? 134 : 110} shape="widget" />{/each}</div></div>
        </div>
      {:else}
        <div class="skcol"><Skeleton h={22} w={90} shape="line" /><div class="two"><Skeleton h={150} shape="tile" /><Skeleton h={150} shape="tile" /></div>
          <Skeleton h={64} shape="tile" /><Skeleton h={22} w={90} shape="line" /><Skeleton h={170} shape="widget" />
          <!-- The Bill + Demain pair: with a place, Demain's compact weather line (two lines) makes it taller. -->
          <div class="two">{#each [0, 1] as i (i)}<Skeleton h={weather.on ? 164 : 120} shape="widget" />{/each}</div></div>
      {/if}
    </div>
  {:else if desktop.matches}
    {@render chips(false)}
    <div class="stack">{@render notices(false)}</div>
    <div class="board">
      <div class="left" class:solo={!groups.off.length}>
        <div class="rooms" class:one={groups.on.length === 1}>
          {#each groups.on as room (room.id)}
            <MaisonColumn {room} {now} points={history.data[key(room.id)] ?? []} {start} {end} />
          {/each}
        </div>
        {#if groups.off.length}
          <section class="offcol" aria-labelledby="maison-off">
            <div class="areah"><h2 id="maison-off" class="faint">{m.rooms.offlineGroup(groups.off.length)}</h2></div>
            {#each groups.off as room (room.id)}<MaisonRoom {room} {now} layout="widget" />{/each}
          </section>
        {/if}
        <div class="wide"><TodayProgram {now} /></div>
      </div>
      <section class="energy" aria-labelledby="maison-energy">
        <div class="areah"><h2 id="maison-energy">{m.maison.energyHead}</h2><a class="more" href={ROUTES.energy}>{m.maison.energyLink}<Icon
              name="chevron" size={13} /></a></div>
        {@render energyWidgets(false)}
      </section>
    </div>
  {:else}
    {@render chips(true)}
    <div class="stack">{@render notices(true)}</div>
    <section aria-labelledby="maison-rooms">
      <div class="areah"><h2 id="maison-rooms">{m.nav.roomsHead}</h2><span>{m.maison.roomsSummary(c.heating, c.offline, c.allOff)}</span></div>
      <div class="tiles">
        {#each groups.on as room (room.id)}<MaisonRoom {room} {now} />{/each}
        {#each groups.off as room (room.id)}<MaisonRoom {room} {now} class="span2" />{/each}
      </div>
    </section>
    <section class="phone-energy" aria-labelledby="maison-energy">
      <div class="areah"><h2 id="maison-energy">{m.nav.energy}</h2><a class="more" href={ROUTES.energy}>{m.maison.energyLink}<Icon name="chevron"
            size={13} /></a></div>
      {@render energyWidgets(true)}
    </section>
    <TodayProgram {now} phone />
  {/if}
</div>

<style>
  .maison {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    min-width: 0;
    container-type: inline-size;
  }
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'pa pa' 'title title';
    align-items: start;
    gap: 6px 12px;
  }
  .phone-actions {
    grid-area: pa;
    display: flex;
    justify-content: flex-end;
    min-height: 44px;
  }
  .title {
    grid-area: title;
    min-width: 0;
  }
  .date {
    margin: 2px 0 0;
    color: var(--mu);
    font-size: 14px;
  }
  .desk-actions {
    display: none;
  }
  /* One line of 46 px chips at every width (scrolling inside the page when they overflow), so a chip whose value
     or presence arrives late never changes the page's height; the 4 px above and below hold the focus ring. */
  .chips {
    margin-top: 8px;
    margin-bottom: 12px;
    padding-block: 4px;
  }
  .stack {
    display: grid;
    gap: 14px;
  }
  .stack:not(:empty) {
    margin-bottom: 18px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--gap-w);
  }
  .tiles :global(.span2) {
    grid-column: span 2;
  }
  .phone-energy {
    display: grid;
    gap: var(--gap-w);
    margin: 22px 0;
  }
  .phone-energy .areah {
    margin-bottom: 0;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--gap-w);
  }
  .pair > :global(:only-child) {
    grid-column: span 2;
  }
  .more {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--mu);
    text-decoration: none;
  }
  .more::before {
    content: '';
    position: absolute;
    inset: -12px -6px;
  }
  .faint {
    color: var(--fa);
  }
  .sk {
    display: grid;
    gap: 18px;
  }
  .sk-chips {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    overflow: hidden;
  }
  .skcol {
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Desktop board: rooms (two columns of 254), the offline column (200), energy (the rest). */
  .board {
    display: grid;
    grid-template-columns: minmax(0, 762px) minmax(320px, 1fr);
    gap: 18px;
    align-items: start;
  }
  .left {
    display: grid;
    grid-template-columns: minmax(0, 526px) minmax(0, 200px);
    gap: 18px;
    align-items: start;
  }
  .left.solo {
    grid-template-columns: minmax(0, 526px);
  }
  .rooms {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 254px));
    gap: 18px;
    align-items: start;
  }
  .rooms.one {
    grid-template-columns: minmax(0, 254px);
  }
  .offcol {
    display: grid;
    gap: 10px;
    align-content: start;
  }
  .offcol .areah {
    margin-bottom: 2px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .energy {
    min-width: 0;
  }
  .egrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (min-width: 1024px) {
    .head {
      grid-template-areas: 'title actions';
      align-items: center;
    }
    .phone-actions {
      display: none;
    }
    .desk-actions {
      display: block;
      grid-area: actions;
    }
    .chips {
      flex-wrap: nowrap;
      margin: 14px 0 18px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .sk-chips {
      margin-top: 18px;
    }
  }
  /* A narrower desktop: the energy column goes under the rooms. */
  @container (max-width: 1100px) {
    .board {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
