<script lang="ts">
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { ROUTES } from '$lib/paths';
  import { house } from '$lib/stores/house.svelte';
  import GridStrip from './GridStrip.svelte';
  import HouseActions from './HouseActions.svelte';
  import Icon from './Icon.svelte';
  import RoomInspector from './RoomInspector.svelte';
  import RoomList from './RoomList.svelte';

  interface Props {
    /** The room shown in the inspector (desktop) or on its own page (phone). */
    roomId: string | null;
    /** The "/" list; otherwise a room page. */
    home?: boolean;
  }
  let { roomId, home = false }: Props = $props();
  // Desktop keeps one layout for "/" and a room page, so the list never jumps between them.
  let showList = $derived(home || desktop.matches);
  // Before the house is known, desktop keeps the inspector column in its skeleton shape.
  let showInspector = $derived((!home || desktop.matches) && (!!roomId || (!house.loaded && desktop.matches)));
</script>

{#if showList}
  <!-- Fixed block sizes (a 44 px title row, one summary line): the header never reflows when a font arrives. -->
  <header class="top">
    <h1 class="t-page">{m.nav.rooms}</h1>
    {#if house.loaded}
      {@const summary = `${m.rooms.summary(house.heatingCount, house.offlineCount)}${house.away ? ` · ${m.rooms.awayActive}` : ''}`}
      <p class="muted sum" title={summary}>{summary}</p>
    {:else}
      <p class="sub-sk"><span class="skeleton" aria-hidden="true"></span></p>
    {/if}
    <div class="phone-only"><HouseActions icons /></div>
    <!-- Desktop: the house actions sit on the title row (Tableau §4 header), no longer in the sidebar. -->
    <div class="desk-only"><HouseActions program /></div>
  </header>
  {#if house.loaded}<GridStrip />{/if}
{:else}
  <a class="back" href={ROUTES.rooms}><Icon name="arrow-left" size={16} />{m.nav.rooms}</a>
{/if}

<!-- The strip's height is known only with the snapshot that loads the house (it holds the grid view
     too), so no skeleton can reserve it. The skeleton columns are replaced as a whole by the loaded
     ones, strip included, in the same frame: nothing on screen moves under the strip (CLS). -->
{#key house.loaded}
  <div class="cols">
    {#if showList}<RoomList selectedId={desktop.matches ? roomId : null} selectedIsPage={!home} />{/if}
    {#if showInspector}<div class="detail"><RoomInspector roomId={roomId ?? ''} level={showList ? 'h2' : 'h1'} /></div>{/if}
  </div>
{/key}

<style>
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'title actions' 'sum sum';
    align-items: center;
    column-gap: 12px;
    margin-bottom: 14px;
  }
  h1 {
    grid-area: title;
    line-height: 44px;
  }
  .phone-only,
  .desk-only {
    grid-area: actions;
    min-height: 44px;
  }
  .desk-only {
    display: none;
  }
  p {
    grid-area: sum;
    margin: 2px 0 0;
    font-size: 13px;
    line-height: 19px;
  }
  .sum {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub-sk {
    display: flex;
    align-items: center;
    height: 19px;
  }
  .sub-sk .skeleton {
    display: block;
    width: 11rem;
    height: 13px;
    border-radius: 4px;
  }
  .back {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    color: var(--mu);
    text-decoration: none;
    font-size: 13px;
    transition: color var(--t-state) ease;
  }
  .back:hover {
    color: var(--tx);
  }
  .cols {
    display: grid;
    gap: 16px;
  }
  @media (min-width: 1024px) {
    .phone-only {
      display: none;
    }
    .desk-only {
      display: block;
    }
    .cols {
      /* The list takes what the inspector leaves: no page scroll from 1024 px up. */
      grid-template-columns: minmax(0, 1fr) clamp(320px, 38%, 440px);
      align-items: start;
    }
    .detail {
      position: sticky;
      top: 24px;
      padding: 16px;
      border-radius: var(--r-widget);
      background: var(--s1);
      max-height: calc(100dvh - 48px);
      overflow: auto;
      overscroll-behavior: contain;
    }
  }
</style>
