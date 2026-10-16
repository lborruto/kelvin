<!-- Réglages › Sources de données (Tableau §4, mockups 5 « Sources »): every source Kelvin reads as a grouped
     row with its freshness ring, its state sentence and its last time; a row opens its exact times (SourcesList).
     The day's MyElectricalData calls close the page as a note. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus, Sources } from '$lib/api/types';
  import SourcesList from '$lib/components/SourcesList.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { m } from '$lib/i18n';
  import { lateCount, sourceRows } from '$lib/sources';
  import { house } from '$lib/stores/house.svelte';

  let linky = $state<LinkyStatus | null | undefined>(undefined);
  let grid = $state<Sources | null | undefined>(undefined);
  let now = $state(Date.now());
  $effect(() => {
    api.linkyStatus().then((s) => (linky = s), () => (linky = null));
    api.status().then((s) => (grid = s.sources ?? null), () => (grid = null));
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  let ready = $derived(linky !== undefined && grid !== undefined && house.loaded);
  let rows = $derived(ready ? sourceRows({ status: house.status, live: house.online, linky: linky ?? null, grid: grid ?? null }, now) : []);
  let late = $derived(lateCount(rows));
</script>

<svelte:head><title>{m.page.title(m.sources.title)}</title></svelte:head>

<div class="page">
  <SettingsHeader back title={m.sources.title} vt="home-sources" state={ready ? (late ? m.home.cardSourcesLate(late) : m.home.cardSourcesOk) : null} />

  {#if ready}
    <section class="grp" aria-label={m.sources.title}>
      <SourcesList {rows} {now} />
    </section>
    {#if grid}
      <p class="note">{m.sources.med(grid.med.calls_today, grid.med.budget, grid.med.grid_calls_today)}</p>
      <p class="note">{m.sources.via}</p>
    {:else}
      <p class="note">{m.sources.loadFailed}</p>
    {/if}
  {:else}
    <div class="skeleton" style:height="200px" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .page {
    display: grid;
    gap: 10px;
    max-width: 720px;
    min-width: 0;
  }
  .page > :global(.sh) {
    margin-bottom: 10px;
  }
  .note {
    margin: -6px 16px 0;
  }
  .grp + .note {
    margin-top: 0;
  }
</style>
