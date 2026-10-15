<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { canonical, ROUTES } from '$lib/paths';

  // Defence in depth: app.html rewrites a French path before the router boots, and an in-app link
  // to an unmatched route is a full page load, so it goes through app.html too. Should the
  // pre-boot script not have run, a legacy 404 still lands on its English page here.
  let target = $derived(page.status === 404 ? canonical(page.url.pathname, page.url.hash) : null);
  $effect(() => {
    if (target) void goto(target.pathname + page.url.search + target.hash, { replaceState: true });
  });
</script>

{#if page.status === 404}
  {#if !target}
    <h1>Page introuvable.</h1>
    <p><a href={ROUTES.rooms}>Retour aux pièces</a></p>
  {/if}
{:else}
  <h1>Une erreur est survenue.</h1>
  <p class="actions">
    <button type="button" class="btn btn-sm" onclick={() => location.reload()}>Réessayer</button>
    <a href={ROUTES.rooms}>Retour aux pièces</a>
  </p>
{/if}

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
</style>
