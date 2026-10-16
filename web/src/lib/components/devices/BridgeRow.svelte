<!-- A bridge or an appliance in Pièces et appareils (direction-2 §4): its household name (« Box Cozytouch »,
     « Pont radio (io-homecontrol) », « Wi-Fi de la box ») over its state in words, the whole row a button that
     opens the raw device (label, widget, states: DeviceRow) below it. Closed: `hidden="until-found"`;
     « Détails techniques » opens it. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { SetupDevice } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { bridgeName } from '$lib/setup';
  import { detail } from '$lib/stores/detail.svelte';
  import Icon from '../Icon.svelte';
  import SupportChip from '../SupportChip.svelte';
  import DeviceRow from './DeviceRow.svelte';

  interface Props {
    device: SetupDevice;
    now: number;
    /** The name (default: the bridge's household name). */
    name?: string;
    /** Words before the state (an appliance's role). */
    lead?: string | null;
  }
  let { device, now, name, lead = null }: Props = $props();
  const uid = $props.id();
  let open = $state(untrack(() => detail.on));
  let title = $derived(name ?? bridgeName(device));
  let reach = $derived(device.reachable === null ? m.devices.notReported : device.reachable ? m.devices.reachable : m.devices.unreachable);
</script>

<li class="brow">
  <button type="button" class="row" aria-expanded={open} aria-controls="{uid}-raw" onclick={() => (open = !open)}>
    <span class="who">
      <span class="name">{title} <SupportChip support={device.support} /></span>
      <span class="state" class:bad={device.reachable === false}>{[lead, reach].filter(Boolean).join(' · ')}</span>
    </span>
    <span class="chev" class:open aria-hidden="true"><Icon name="chevron" size={16} /></span>
  </button>
  <div id="{uid}-raw" class="raw" hidden={open ? undefined : 'until-found'} onbeforematch={() => (open = true)}>
    <ul><DeviceRow {device} {now} /></ul>
  </div>
</li>

<style>
  .brow {
    list-style: none;
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 6px 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .who {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .state {
    font-size: 12px;
    color: var(--mu);
  }
  .state.bad {
    color: var(--bad);
  }
  .chev {
    display: inline-flex;
    color: var(--fa);
    transition: transform var(--t-enter) var(--ease-out);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .raw ul {
    margin: 0 0 8px;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--line);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
