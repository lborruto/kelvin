<!-- Maison › Sources de données (UX batch 8: the Sources panel moved from the Maison page, unchanged). -->
<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SourcesPanel from '$lib/components/SourcesPanel.svelte';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
</script>

<svelte:head><title>{m.page.title(m.sources.title)}</title></svelte:head>

<PageHeader title={m.sources.title} back={{ href: ROUTES.home, label: m.nav.home }} />
<section class="panel"><SourcesPanel /></section>

<style>
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    max-width: 720px;
  }
</style>
