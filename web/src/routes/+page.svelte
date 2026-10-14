<script lang="ts">
  import PiecesView from '$lib/components/PiecesView.svelte';
  import { house } from '$lib/stores/house.svelte';

  // Chosen once, so the inspector does not jump when another room starts needing attention.
  let chosen = $state<string | null>(null);
  $effect(() => {
    if (house.loaded && (!chosen || !house.room(chosen))) chosen = house.defaultRoomId;
  });
</script>

<svelte:head><title>Pièces · Kelvin</title></svelte:head>

<PiecesView roomId={chosen} home />
