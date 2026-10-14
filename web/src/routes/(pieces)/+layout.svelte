<script lang="ts">
  import { page } from '$app/state';
  import PiecesView from '$lib/components/PiecesView.svelte';
  import { house } from '$lib/stores/house.svelte';

  let { children } = $props();
  // "/" and "/pieces/[id]" share one PiecesView: on desktop the list stays mounted when a card is
  // chosen, so keyboard focus stays on that card and nothing re-renders but the inspector.
  let id = $derived(page.params.id ?? null);
  // "/": chosen once, so the inspector does not jump when another room starts needing attention.
  let chosen = $state<string | null>(null);
  $effect(() => {
    if (house.loaded && (!chosen || !house.room(chosen))) chosen = house.defaultRoomId;
  });
</script>

<PiecesView roomId={id ?? chosen} home={!id} />
{@render children()}
