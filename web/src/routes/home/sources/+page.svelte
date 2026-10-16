<!-- Maison › Sources de données (direction-2 §3, UX batch 9): every source Kelvin reads, its freshness, and
     its exact times one row-tap away (SourcesList). The day's MyElectricalData calls close the panel. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus, Sources } from '$lib/api/types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SourcesList from '$lib/components/SourcesList.svelte';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
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

<div class="vt">
  <PageHeader title={m.sources.title} back={{ href: ROUTES.home, label: m.nav.home }}>
    {#snippet stateLine()}
      {#if ready}<p class="state">{late ? m.home.cardSourcesLate(late) : m.home.cardSourcesOk}</p>
      {:else}<p class="state"><span class="skeleton line-sk" aria-hidden="true"></span></p>{/if}
    {/snippet}
  </PageHeader>
</div>

<div class="page">
  {#if ready}
    <section class="panel" aria-label={m.sources.title}>
      <SourcesList {rows} {now} />
      {#if grid}
        <p class="foot">{m.sources.med(grid.med.calls_today, grid.med.budget, grid.med.grid_calls_today)}</p>
        <p class="foot">{m.sources.via}</p>
      {:else}
        <p class="foot">{m.sources.loadFailed}</p>
      {/if}
    </section>
  {:else}
    <div class="skeleton block" style:height="300px" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .vt :global(h1) {
    view-transition-name: home-sources;
  }
  .page {
    display: grid;
    gap: 14px;
    max-width: 720px;
    min-width: 0;
  }
  .state {
    margin: 0;
    height: 19px;
    font-size: 13px;
    line-height: 19px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-sk {
    display: inline-block;
    width: 10rem;
    height: 13px;
    border-radius: 4px;
    vertical-align: -2px;
  }
  .block {
    border-radius: var(--radius);
  }
  .panel {
    padding: 0 14px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
  }
  .foot {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
</style>
