<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SetupDevice, SetupRadiator } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import DeviceRow from './DeviceRow.svelte';

  interface Props {
    radiator: SetupRadiator;
    now: number;
    /** The radiator's actions (rename, move), Task 11. */
    children?: Snippet;
    deviceActions?: Snippet<[SetupDevice]>;
  }
  let { radiator, now, children, deviceActions }: Props = $props();
</script>

<li class="radiator">
  <div class="top">
    <span class="name">{radiator.name}</span>
    {@render children?.()}
  </div>
  <details>
    <summary>{m.devices.deviceCount(radiator.devices.length)}</summary>
    <ul>
      {#each radiator.devices as d (d.id)}
        <DeviceRow device={d} {now}>{@render deviceActions?.(d)}</DeviceRow>
      {/each}
    </ul>
  </details>
</li>

<style>
  .radiator {
    list-style: none;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-size: 13px;
    color: var(--mu);
    cursor: pointer;
  }
  ul {
    margin: 0;
    padding: 0 0 0 12px;
    list-style: none;
  }
</style>
