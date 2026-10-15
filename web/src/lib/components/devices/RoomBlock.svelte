<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Pending, SetupDevice, SetupRadiator, SetupRoom } from '$lib/api/types';
  import PendingEdge from '../PendingEdge.svelte';
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
    pending?: Pending;
    radiatorPending?: (id: string) => Pending | undefined;
  }
  let { room, radiators, now, actions, radiatorActions, deviceActions, pending, radiatorPending }: Props = $props();
  const uid = $props.id();
</script>

<section class="panel room" aria-labelledby="{uid}-name">
  <PendingEdge shape="rect" rx={10} pending={pending?.status === 'sending' || pending?.status === 'pending'} confirmed={pending?.status === 'confirmed'} />
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
        <RadiatorDevices radiator={r} {now} {deviceActions} pending={radiatorPending?.(r.id)}>{@render radiatorActions?.(r)}</RadiatorDevices>
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
    position: relative;
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
