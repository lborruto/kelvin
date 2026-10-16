<!-- The desktop sidebar (Tableau spec §2): 220 px on --side. Maison, Programme, Énergie; the « PIÈCES » section
     (one row per room: a heat flame while heating and the reading on the right; offline rooms last, faint, a
     plug, no temperature), each opening its room; then Partir… (the Absence sheet), Réglages and the Cozytouch
     SourceLine footer (dashed while reconnecting). The alert dot sits on Maison, only for a must-fix alert. -->
<script lang="ts">
  import { page } from '$app/state';
  import { fmtTemp, fmtTempShort, fmtWeekdayTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ALERT_KEY, NAV_BOTTOM, NAV_ICON, NAV_TOP, sidebarRooms } from '$lib/nav';
  import { navAlerts } from '$lib/navAlerts';
  import { isActive, ROUTES } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { house } from '$lib/stores/house.svelte';
  import CozytouchStatus from './CozytouchStatus.svelte';
  import Icon from './Icon.svelte';
  import Wordmark from './Wordmark.svelte';

  interface Props {
    /** The layout's clock, for the status footer's « il y a 1 min ». */
    now?: number;
  }
  let { now = Date.now() }: Props = $props();
  let dot = $derived(navAlerts(alerts.summary, alerts.list));
  let rooms = $derived(
    house.loaded ? sidebarRooms(house.rooms, (id) => house.roomRadiators(id), (id) => house.roomHeating(id), roomName) : []
  );
  let path = $derived(page.url.pathname);
  /** The room whose sheet is open: its row is current, Maison is not. */
  let roomPath = $derived(path.startsWith('/rooms/') ? path : null);
  let away = $derived(house.away);
  let awayLabel = $derived(away ? m.away.short(fmtWeekdayTime(away.ends_at * 1000)) : m.nav.away);
  const current = (href: string) => (href === ROUTES.rooms && roomPath ? false : isActive(path, href));
</script>

{#snippet link(l: (typeof NAV_TOP)[number])}
  {@const flag = l.key === ALERT_KEY && dot.count > 0}
  <!-- The dot never changes the link's width (absolutely placed); the count is in the name. -->
  <a class="nav" href={l.href} aria-current={current(l.href) ? 'page' : undefined}
    aria-label={flag ? m.nav.alerts(m.nav[l.key], dot.count) : undefined}><span class="ic"><Icon name={NAV_ICON[l.key]} size={20} />{#if flag && dot.bad}<span
          class="dot" aria-hidden="true"></span>{/if}</span>{m.nav[l.key]}</a>
{/snippet}

<nav class="sidebar" aria-label={m.nav.label}>
  <div class="brand"><Wordmark /></div>
  {#each NAV_TOP as l (l.href)}{@render link(l)}{/each}
  <div class="rooms" role="group" aria-labelledby="side-rooms">
    {#if rooms.length}
      <h2 class="head" id="side-rooms">{m.nav.roomsHead}</h2>
      <ul>
        {#each rooms as r (r.id)}
          {@const href = ROUTES.room(r.id)}
          <li>
            <a class="nav room" class:off={r.offline} {href} aria-current={roomPath === href ? 'page' : undefined}
              aria-label={m.nav.roomRow(r.name, r.reading == null ? null : fmtTemp(r.reading), r.heating, r.offline)}>
              <span class="ic" class:heat={r.heating}><Icon name={r.offline ? 'plug-off' : r.heating ? 'flame' : 'grid'} size={18} /></span>
              <span class="nm">{r.name}</span>
              {#if !r.offline && r.reading != null}<span class="t num" aria-hidden="true">{fmtTempShort(r.reading)}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <span class="visually-hidden" id="side-rooms">{m.nav.roomsLabel}</span>
    {/if}
  </div>
  <div class="foot">
    <button type="button" class="nav" class:cool={!!away} onclick={(e) => awaySheet.show(e.currentTarget)}><span class="ic"><Icon
          name="away" size={20} /></span><span class="nm">{awayLabel}</span></button>
    {#each NAV_BOTTOM as l (l.href)}{@render link(l)}{/each}
    <div class="status"><CozytouchStatus {now} /></div>
  </div>
</nav>

<style>
  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 20px 12px 16px;
    border-right: 1px solid var(--line);
    background: var(--side);
  }
  .brand {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin: -8px 10px 14px;
  }
  .nav {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-seg);
    background: transparent;
    color: var(--mu);
    font: inherit;
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  /* 40 px painted rows, 44 px hit areas that never overlap (2 px gap + 2 px each way). */
  .nav::before {
    content: '';
    position: absolute;
    inset: -2px 0;
  }
  @media (hover: hover) {
    .nav:not([aria-current='page']):hover {
      background: color-mix(in srgb, var(--s2) 50%, transparent);
      color: var(--tx);
    }
  }
  .nav[aria-current='page'] {
    background: var(--s2);
    color: var(--tx);
  }
  .ic {
    position: relative;
    display: grid;
    flex: none;
  }
  .ic.heat {
    color: var(--heat);
  }
  .dot {
    position: absolute;
    top: -2px;
    right: -3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bad);
    box-shadow: 0 0 0 2px var(--side);
  }
  .rooms {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .head {
    margin: 18px 12px 6px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fa);
  }
  ul {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 2px 0;
    list-style: none;
  }
  .nm {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t {
    margin-left: auto;
    color: var(--fa);
    font-size: 14px;
  }
  .room.off {
    color: var(--fa);
  }
  /* Faint reads under 4.5:1 on s2: the current row's reading is muted. */
  .nav[aria-current='page'] .t,
  .room.off[aria-current='page'] {
    color: var(--mu);
  }
  .foot {
    display: grid;
    gap: 2px;
    margin-top: auto;
    padding-top: 12px;
  }
  .nav.cool,
  .nav.cool .ic {
    color: var(--cool);
  }
  /* The status footer: under a hairline, the app's one always-visible freshness signal. */
  .status {
    margin: 10px 4px 0;
    padding: 10px 8px 0;
    border-top: 1px solid var(--line);
  }
</style>
