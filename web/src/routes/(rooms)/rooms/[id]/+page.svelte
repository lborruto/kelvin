<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { house } from '$lib/stores/house.svelte';

  let name = $derived(house.room(page.params.id ?? '')?.name ?? m.room.title);
</script>

<svelte:head><title>{m.page.title(name)}</title></svelte:head>
