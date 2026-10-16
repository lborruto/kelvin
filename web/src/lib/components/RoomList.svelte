<script lang="ts">
  import type { Room } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { isOffline } from '$lib/status';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import RoomCard from './RoomCard.svelte';

  interface Props {
    selectedId?: string | null;
    /** The selected room is the page's URL ("/rooms/[id]"), not the default of "/". */
    selectedIsPage?: boolean;
  }
  let { selectedId = null, selectedIsPage = false }: Props = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  const key = (roomId: string) => `${roomId}|day|${start}`;

  // Cozytouch order, except that offline rooms (radiators switched off at the mains: normal here)
  // move to the end under a quiet label, so the rooms that answer carry the attention.
  let groups = $derived.by(() => {
    const on: Room[] = [];
    const off: Room[] = [];
    for (const r of house.rooms) (isOffline(house.roomRadiators(r.id)) ? off : on).push(r);
    return { on, off };
  });

  $effect(() => {
    for (const r of groups.on) history.load(key(r.id), r.radiator_ids, start, Math.min(end, now), 900);
  });
</script>

{#snippet card(room: Room)}
  <RoomCard {room} {now} points={history.data[key(room.id)] ?? []} desktop={desktop.matches} selected={desktop.matches && selectedId === room.id}
    current={selectedIsPage && selectedId === room.id} />
{/snippet}

<div class="list">
  {#if !house.loaded}
    {#each [0, 1, 2] as i (i)}<div class="skeleton card-sk" aria-hidden="true"></div>{/each}
  {:else}
    {#each groups.on as room (room.id)}{@render card(room)}{/each}
    {#if groups.off.length}
      <h2 class="group">{m.rooms.offlineGroup(groups.off.length)}</h2>
      {#each groups.off as room (room.id)}{@render card(room)}{/each}
    {/if}
  {/if}
</div>

<style>
  .list {
    display: grid;
    gap: 10px;
    container-type: inline-size;
  }
  /* The final height of an online card: one status line on a wide card, two on a narrow one. */
  .card-sk {
    height: 116px;
  }
  @container (max-width: 419px) {
    .card-sk {
      height: 136px;
    }
  }
  /* Section label style, with a hairline to the right. */
  .group {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  .group::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }
</style>
