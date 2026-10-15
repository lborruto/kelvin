<script lang="ts">
  import { desktop } from '$lib/media.svelte';
  import { ROUTES } from '$lib/paths';
  import { plural } from '$lib/plural';
  import { house } from '$lib/stores/house.svelte';
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
  <header class="top">
    <div>
      <h1>Pièces</h1>
      {#if house.loaded}
        <p class="muted">{plural(house.rooms.length, 'pièce')} · {house.heatingCount} en chauffe{#if house.away} · Absence en cours{/if}</p>
      {:else}
        <p class="sub-sk"><span class="skeleton" aria-hidden="true"></span></p>
      {/if}
    </div>
    <div class="phone-only"><HouseActions /></div>
  </header>
{:else}
  <a class="back" href={ROUTES.rooms}><Icon name="arrow-left" size={16} />Pièces</a>
{/if}

<div class="cols">
  {#if showList}<RoomList selectedId={desktop.matches ? roomId : null} selectedIsPage={!home} />{/if}
  {#if showInspector}<div class="detail"><RoomInspector roomId={roomId ?? ''} level={showList ? 'h2' : 'h1'} /></div>{/if}
</div>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: end;
    gap: 12px;
    margin-bottom: 14px;
  }
  h1 {
    font-size: 22px;
    margin: 0;
    letter-spacing: -0.01em;
  }
  p {
    margin: 2px 0 0;
    font-size: 13px;
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
    .cols {
      /* The list takes what the inspector leaves: no page scroll from 1024 px up. */
      grid-template-columns: minmax(0, 1fr) clamp(320px, 38%, 440px);
      align-items: start;
    }
    .detail {
      position: sticky;
      top: 24px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--s1);
      max-height: calc(100dvh - 48px);
      overflow: auto;
      overscroll-behavior: contain;
    }
  }
</style>
