<!-- Maison › Tarif (UX batch 8: the tariff panel moved from the Maison page, unchanged). -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SettingsView, Slot } from '$lib/api/types';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import TariffForm from '$lib/components/TariffForm.svelte';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';

  let settings = $state<SettingsView | null>(null);
  let failed = $state(false);
  function load() {
    failed = false;
    api.settings().then((s) => (settings = s), () => (failed = true));
  }
  $effect(() => load());
</script>

<svelte:head><title>{m.page.title(m.tariff.title)}</title></svelte:head>

<PageHeader title={m.tariff.title} back={{ href: ROUTES.home, label: m.nav.home }} />
<section class="panel">
  {#if settings}
    <TariffForm {settings} onsaved={(s) => (settings = s)} contractSlots={(alerts.of(['hc_changed'])[0]?.params.slots as Slot[] | undefined) ?? null} />
  {:else if failed}
    <p class="error" role="alert">{m.home.tariffLoadFailed} <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button></p>
  {:else}
    <div class="skeleton inset" style:height="320px" aria-hidden="true"></div>
  {/if}
</section>

<style>
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    max-width: 720px;
  }
  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }
  .error .btn {
    color: var(--tx);
  }
</style>
