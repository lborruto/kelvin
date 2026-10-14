<script lang="ts">
  import { page } from '$app/state';
  import { house } from '$lib/stores/house.svelte';

  let name = $derived(house.room(page.params.id ?? '')?.name ?? 'Pièce');
</script>

<svelte:head><title>{name} · Kelvin</title></svelte:head>
