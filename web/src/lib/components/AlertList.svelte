<script lang="ts">
  import { alertText } from '$lib/alerts-text';
  import { m } from '$lib/i18n';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';
  import AlertCallout from './AlertCallout.svelte';

  interface Props {
    /** Keep the skeleton although the list is in: the panels below are still skeletons (one frame for all). */
    hold?: boolean;
  }
  let { hold = false }: Props = $props();

  $effect(() => {
    if (auth.loggedIn !== false && alerts.list === null) void alerts.load(); // not while signing out (a 401 would re-ask the login)
  });
  // What the skeleton stands in for: the alert count that came with the snapshot (none before it).
  let expected = $derived(house.loaded ? alerts.summary.active : 0);
  let shown = $derived((alerts.list ?? []).filter((a) => alertText(a) !== null));
</script>

{#if alerts.list === null || hold}
  <div class="sk" aria-hidden="true">
    {#if expected === 0}
      <div class="skeleton inset none-sk"></div>
    {:else}
      <div class="alerts">{#each Array.from({ length: expected }, (_, i) => i) as i (i)}<div class="skeleton inset row-sk"></div>{/each}</div>
    {/if}
  </div>
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
  /* Final heights: a callout is 1 to 5 lines of 19.5 px by the width it gets; the empty line is a 13 px line at 1.5. */
  .sk {
    container-type: inline-size;
  }
  .none-sk {
    height: 20px;
  }
  .row-sk {
    height: 57px;
  }
  @container (max-width: 350px) {
    .row-sk {
      height: 76px;
    }
  }
  @container (max-width: 280px) {
    .row-sk {
      height: 96px;
    }
  }
</style>
