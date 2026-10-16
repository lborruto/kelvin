<!-- The other devices in Pièces et appareils (Plan 12; Tableau mockups 5): a grouped list under its label, each
     read-only and never hidden. -->
<script lang="ts">
  import type { SetupDevice } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { deviceLabel } from '$lib/setup';
  import BridgeRow from './BridgeRow.svelte';

  /** Plan 12: every device that is neither a radiator's nor a bridge — water heaters, heat
   *  pumps, devices that do not heat — listed read-only, never hidden. */
  let { devices, now }: { devices: SetupDevice[]; now: number } = $props();
</script>

{#if devices.length}
  <section aria-labelledby="appliances-title">
    <h2 id="appliances-title" class="grph">{m.devices.appliances}</h2>
    <ul class="grp list">
      {#each devices as d (d.id)}<BridgeRow device={d} {now} name={deviceLabel(d)} lead={m.devices.role[d.role]} />{/each}
    </ul>
    <p class="note">{m.devices.appliancesNote}</p>
  </section>
{/if}

<style>
  section {
    min-width: 0;
  }
  .grph {
    margin-top: 6px;
  }
  .note {
    margin: 6px 16px 0;
  }
</style>
