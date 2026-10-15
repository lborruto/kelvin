<!-- Maison › Linky (UX batch 8: the Linky panel moved from the Maison page, unchanged). -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import LinkyPanel from '$lib/components/LinkyPanel.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';

  let status = $state<LinkyStatus | null>(null);
  let failed = $state(false);
  function load() {
    failed = false;
    api.linkyStatus().then((s) => (status = s), () => (failed = true));
  }
  $effect(() => load());
</script>

<svelte:head><title>{m.page.title('Linky')}</title></svelte:head>

<PageHeader title="Linky" back={{ href: ROUTES.home, label: m.nav.home }} />
<section class="panel">
  {#if status}
    <LinkyPanel {status} onsaved={(s) => (status = s)} />
  {:else if failed}
    <p class="error" role="alert">{m.home.linkyLoadFailed} <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button></p>
  {:else}
    <div class="skeleton inset" style:height="160px" aria-hidden="true"></div>
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
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }
  .error .btn {
    color: var(--tx);
  }
</style>
