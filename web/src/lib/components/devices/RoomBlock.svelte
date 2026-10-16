<!-- A room in Pièces et appareils (Tableau §4, mockups 5 « Pièces et appareils »): a grouped list (s1, radius 16,
     hairline rows). Header: the name (15/600), « 2 radiateurs » (12.5 faint), and the room's « ⋯ » Menu (`items`: Renommer la pièce, Supprimer la
     pièce with its reason when it cannot go). Two radiators with one name get a muted hint with « Renommer »
     (the only text button inside a room block). Each radiator is a RadiatorDevices row. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Pending, Radiator, SetupDevice, SetupRadiator, SetupRoom } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { roomName, sameNamed } from '$lib/setup';
  import Icon from '../Icon.svelte';
  import Menu, { type MenuItem } from '../Menu.svelte';
  import PendingEdge from '../PendingEdge.svelte';
  import RadiatorDevices from './RadiatorDevices.svelte';

  interface Props {
    room: SetupRoom;
    radiators: SetupRadiator[];
    now: number;
    /** The room's « ⋯ » actions; none: no menu (the house root, an experimental server). */
    items?: MenuItem[];
    /** Under the header: the room's rename form and its PendingTag. */
    actions?: Snippet;
    /** Each radiator's « ⋯ » actions. */
    radiatorItems?: (r: SetupRadiator) => MenuItem[];
    /** Under each radiator row: its rename form and PendingTag. */
    radiatorActions?: Snippet<[SetupRadiator]>;
    deviceActions?: Snippet<[SetupDevice]>;
    /** The house's radiators by id (model, power, reachability). */
    live?: Record<string, Radiator>;
    pending?: Pending;
    radiatorPending?: (id: string) => Pending | undefined;
    /** « Renommer » in the duplicate-name hint (renames the first of them); absent: no button. */
    onrename?: ((r: SetupRadiator) => void) | null;
  }
  let {
    room, radiators, now, items = [], actions, radiatorItems, radiatorActions, deviceActions, live = {}, pending, radiatorPending,
    onrename = null
  }: Props = $props();
  const uid = $props.id();
  let name = $derived(roomName(room));
  let twins = $derived(sameNamed(radiators));
</script>

<section class="panel room" aria-labelledby="{uid}-name">
  <PendingEdge shape="rect" rx={16} pending={pending?.status === 'sending' || pending?.status === 'pending'} confirmed={pending?.status === 'confirmed'} />
  <header>
    <div class="title">
      <h2 id="{uid}-name">{name}</h2>
      <span class="count">{radiators.length ? m.devices.radiatorCount(radiators.length) : m.devices.emptyRoom}</span>
    </div>
    {#if items.length}<Menu label={m.devices.actionsFor(name)} {items} />{/if}
  </header>
  {@render actions?.()}
  {#if twins.length}
    <p class="hint">
      <Icon name="help" size={14} /><span>{m.devices.sameName}</span>
      {#if onrename}<button type="button" class="btn btn-sm btn-ghost" onclick={() => onrename?.(twins[0])}>{m.devices.rename}</button>{/if}
    </p>
  {/if}
  {#if radiators.length}
    <ul class="radiators">
      {#each radiators as r (r.id)}
        <RadiatorDevices radiator={r} live={live[r.id] ?? null} {now} items={radiatorItems?.(r) ?? []} {deviceActions}
          pending={radiatorPending?.(r.id)}>{@render radiatorActions?.(r)}</RadiatorDevices>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel {
    padding: 0 16px;
    border-radius: var(--r-group);
    background: var(--s1);
    min-width: 0;
    position: relative;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 52px;
  }
  .title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 10px;
    min-width: 0;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .count {
    font-size: var(--fs-note);
    color: var(--fa);
  }
  .hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--mu);
  }
  .hint span {
    flex: 1 1 14rem;
  }
  .radiators {
    margin: 0;
    padding: 0;
  }
</style>
