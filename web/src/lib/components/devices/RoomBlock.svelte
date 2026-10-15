<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SetupDevice, SetupRadiator, SetupRoom } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { roomName } from '$lib/setup';
  import RadiatorDevices from './RadiatorDevices.svelte';

  interface Props {
    room: SetupRoom;
    radiators: SetupRadiator[];
    now: number;
    actions?: Snippet;
    radiatorActions?: Snippet<[SetupRadiator]>;
    deviceActions?: Snippet<[SetupDevice]>;
  }
  let { room, radiators, now, actions, radiatorActions, deviceActions }: Props = $props();
  const uid = $props.id();
</script>

<section class="panel room" aria-labelledby="{uid}-name">
  <header>
    <div class="title">
      <h2 id="{uid}-name">{roomName(room)}</h2>
      <span class="count">{radiators.length ? m.devices.radiatorCount(radiators.length) : m.devices.emptyRoom}</span>
    </div>
    {@render actions?.()}
  </header>
  {#if radiators.length}
    <ul class="radiators">
      {#each radiators as r (r.id)}
        <RadiatorDevices radiator={r} {now} {deviceActions}>{@render radiatorActions?.(r)}</RadiatorDevices>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    margin-bottom: 14px;
    max-width: 720px;
    min-width: 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .count {
    font-size: 12px;
    color: var(--mu);
  }
  .radiators {
    margin: 8px 0 0;
    padding: 0;
  }
</style>
