<script lang="ts">
  import { page } from '$app/state';
  import PiecesView from '$lib/components/PiecesView.svelte';
  import { house } from '$lib/stores/house.svelte';

  let id = $derived(page.params.id ?? '');
  let name = $derived(house.room(id)?.name ?? 'Pièce');
</script>

<svelte:head><title>{name} · Kelvin</title></svelte:head>

<PiecesView roomId={id} />
