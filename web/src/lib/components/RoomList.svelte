<script lang="ts" module>
  // Survives navigation: once the user has opened or closed a card on the phone, their choice wins over the default.
  let remembered: { id: string | null } | null = null;
</script>

<script lang="ts">
  import { desktop } from '$lib/media.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import RoomCard from './RoomCard.svelte';

  interface Props {
    selectedId?: string | null;
  }
  let { selectedId = null }: Props = $props();

  let expanded = $state<string | null>(remembered ? remembered.id : null);
  let autoExpanded = false;
  // Phone: open the room that needs attention (else the first) in place once the house is known.
  $effect(() => {
    if (remembered || autoExpanded || !house.loaded || desktop.matches) return;
    autoExpanded = true;
    expanded = house.defaultRoomId;
  });
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  const key = (roomId: string) => `${roomId}|day|${start}`;

  $effect(() => {
    for (const r of house.rooms) history.load(key(r.id), r.radiator_ids, start, Math.min(end, now), 900);
  });

  // Phone only: on desktop the card is a link to the room.
  function select(id: string) {
    expanded = expanded === id ? null : id;
    remembered = { id: expanded };
  }
</script>

<div class="list">
  {#if !house.loaded}
    {#each [0, 1, 2] as i (i)}<div class="skeleton card-sk" aria-hidden="true"></div>{/each}
  {:else}
    {#each house.rooms as room (room.id)}
      <RoomCard {room} {now} expanded={!desktop.matches && expanded === room.id} points={history.data[key(room.id)] ?? []}
        onselect={() => select(room.id)} navigates={desktop.matches} selected={selectedId === room.id} />
    {/each}
  {/if}
</div>

<style>
  .list {
    display: grid;
    gap: 10px;
  }
  .card-sk {
    height: 132px;
  }
</style>
