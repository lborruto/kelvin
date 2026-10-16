<script lang="ts">
  import { page } from '$app/state';
  import Tableau from '$lib/components/dashboard/Tableau.svelte';
  import RoomSheet from '$lib/components/room/RoomSheet.svelte';

  let { children } = $props();
  // "/" and "/rooms/[id]" share one tableau: a room opens as a sheet over it, so the tableau never re-renders
  // and a deep link to a room still shows the house behind it (Tableau §4 « Room sheet »).
  let id = $derived(page.params.id ?? null);
</script>

<Tableau />
{@render children()}
<RoomSheet roomId={id} />
