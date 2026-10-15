<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { canonical, ROUTES } from '$lib/paths';

  // A stale client link from an older bundle (an open tab after a deploy) may still point at a
  // French path: app.html only rewrites full page loads, so this is the safety net.
  let target = $derived(page.status === 404 ? canonical(page.url.pathname, page.url.hash) : null);
  $effect(() => {
    if (target) void goto(target.pathname + page.url.search + target.hash, { replaceState: true });
  });
</script>

{#if !target}
  <h1>Page introuvable.</h1>
  <p><a href={ROUTES.rooms}>Retour aux pièces</a></p>
{/if}
