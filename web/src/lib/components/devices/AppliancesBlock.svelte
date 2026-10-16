<!-- The other devices in Pièces et appareils (Plan 12; Tableau mockups 5): a grouped list under its label, each
     read-only and never hidden. -->
<script lang="ts">
  import type { SetupDevice } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { deviceLabel } from '$lib/setup';
  import BridgeRow from './BridgeRow.svelte';
  import GroupedList from '../GroupedList.svelte';

  /** Plan 12: every device that is neither a radiator's nor a bridge — water heaters, heat
   *  pumps, devices that do not heat — listed read-only, never hidden. */
  let { devices, now }: { devices: SetupDevice[]; now: number } = $props();
</script>

{#if devices.length}
  <section aria-labelledby="appliances-title">
    <GroupedList label={m.devices.appliances} id="appliances-title" level="h2" tag="ul">
      {#each devices as d (d.id)}<BridgeRow device={d} {now} name={deviceLabel(d)} lead={m.devices.role[d.role]} />{/each}
    </GroupedList>
    <p class="note">{m.devices.appliancesNote}</p>
  </section>
{/if}

<style>
  section {
    min-width: 0;
  }
  section > :global(.grph) {
    margin-top: 6px;
  }
  .note {
    margin: 6px 16px 0;
  }
</style>
