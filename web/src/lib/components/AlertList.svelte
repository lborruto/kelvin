<script lang="ts">
  import { alertText } from '$lib/alerts-text';
  import { m } from '$lib/i18n';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import AlertCallout from './AlertCallout.svelte';

  $effect(() => {
    if (auth.loggedIn !== false && alerts.list === null) void alerts.load(); // not while signing out (a 401 would re-ask the login)
  });
  let shown = $derived((alerts.list ?? []).filter((a) => alertText(a) !== null));
</script>

{#if alerts.list === null}
  <div class="skeleton inset" style:height="44px" aria-hidden="true"></div>
{:else if shown.length}
  <ul class="alerts">
    {#each shown as a (a.id)}<li><AlertCallout alert={a} /></li>{/each}
  </ul>
{:else}
  <p class="muted">{m.alerts.none}</p>
{/if}

<style>
  .alerts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  p {
    margin: 0;
    font-size: 13px;
  }
</style>
