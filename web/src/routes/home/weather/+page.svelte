<!-- Réglages › Météo (Plan 14, spec §7.1): the header with the place and its last reading (or « Désactivée »),
     then WeatherPanel (search, coordinates, the place's facts, « Supprimer », the attribution). -->
<script lang="ts">
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import WeatherPanel from '$lib/components/settings/WeatherPanel.svelte';
  import { m } from '$lib/i18n';

  let stateLine = $state<string | null>(null);
</script>

<svelte:head><title>{m.page.title(m.weather.title)}</title></svelte:head>

<div class="page">
  <SettingsHeader title={m.weather.title} back state={stateLine} vt="home-weather" />
  <WeatherPanel onstate={(s) => (stateLine = s)} />
</div>

<style>
  .page {
    display: grid;
    gap: 12px;
    max-width: 720px;
    min-width: 0;
  }
  .page > :global(.sh) {
    margin-bottom: 8px;
  }
</style>
