<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { roomName } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';

  let room = $derived(house.room(page.params.id ?? ''));
  let name = $derived(room ? roomName(room) : m.room.title);
</script>

<svelte:head><title>{m.page.title(name)}</title></svelte:head>
