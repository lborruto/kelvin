<script lang="ts">
  import type { SetupDevice } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import DeviceRow from './DeviceRow.svelte';

  /** Plan 12: every device that is neither a radiator's nor a bridge — water heaters, heat
   *  pumps, devices that do not heat — listed read-only, never hidden. */
  let { devices, now }: { devices: SetupDevice[]; now: number } = $props();
</script>

{#if devices.length}
  <section class="panel" aria-labelledby="appliances-title">
    <h2 id="appliances-title">{m.devices.appliances}</h2>
    <p class="note">{m.devices.appliancesNote}</p>
    <ul class="list">
      {#each devices as d (d.id)}<DeviceRow device={d} {now} />{/each}
    </ul>
  </section>
{/if}

<style>
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    margin-bottom: 14px;
    max-width: 720px;
  }
  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 6px;
  }
  .note {
    font-size: 12px;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
