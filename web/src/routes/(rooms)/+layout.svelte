<script lang="ts">
  import Tableau from '$lib/components/dashboard/Tableau.svelte';

  let { children } = $props();
  // Maison's tableau. A room opens as a sheet over it (or over any other page): the sheet lives in the root
  // layout, driven by `?sheet=<id>`, so the tableau never re-renders under it (Tableau §4 « Room sheet »).
</script>

<Tableau />
{@render children()}
