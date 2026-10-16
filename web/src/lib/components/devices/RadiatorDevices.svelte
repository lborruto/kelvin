<!-- A radiator in Pièces et appareils (Tableau §4, mockups 5): a 56 px row, the radiator glyph (a plug when
     offline, faint), the name (14/600) over « HEKLA P · 1 500 W · Joignable » (« Hors ligne depuis 14:32 » muted), its actions in one « ⋯ » Menu
     (`items`, built by the page: Renommer, Déplacer vers…, Faire clignoter when capable, Voir les appareils).
     « Voir les appareils » opens the sub-device list (DeviceRow, raw states in its own details) below the row.
     A setup write in flight draws the shared dashed edge; the rename form (`children`) sits under the row. -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Pending, Radiator, SetupDevice, SetupRadiator } from '$lib/api/types';
  import { fmtTime, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { locale, m } from '$lib/i18n';
  import { radiatorFacts, radiatorName } from '$lib/setup';
  import Menu, { type MenuItem } from '../Menu.svelte';
  import PendingEdge from '../PendingEdge.svelte';
  import SupportChip from '../SupportChip.svelte';
  import Icon from '../Icon.svelte';
  import DeviceRow from './DeviceRow.svelte';

  interface Props {
    radiator: SetupRadiator;
    /** The house's view of it (model, power, reachability), when known. */
    live?: Radiator | null;
    now: number;
    /** The row's « ⋯ » actions; « Voir les appareils » is added here. */
    items?: MenuItem[];
    /** Under the row: the rename form. */
    children?: Snippet;
    deviceActions?: Snippet<[SetupDevice]>;
    pending?: Pending;
  }
  let { radiator, live = null, now, items = [], children, deviceActions, pending }: Props = $props();
  const uid = $props.id();
  // A device in the wrong room is news: its list starts open.
  let open = $state(untrack(() => radiator.devices.some((d) => d.misplaced)));

  let name = $derived(radiatorName(radiator));
  let facts = $derived(radiatorFacts(radiator, live));
  let heater = $derived(radiator.devices.find((d) => d.role === 'heater'));
  let reachable = $derived(live?.reachable ?? heater?.reachable ?? null);
  let since = $derived(live?.unreachable_since ? live.unreachable_since * 1000 : null);
  let status = $derived(
    reachable === false
      ? since
        ? m.devices.offlineSince(parisTodayIso(since) === parisTodayIso(now) ? fmtTime(since) : fmtWeekdayTime(since))
        : m.devices.offline
      : reachable === true
        ? m.devices.reachable
        : null
  );
  let line = $derived(
    [facts.model, facts.power !== null ? m.devices.watts(new Intl.NumberFormat(locale.intl).format(facts.power)) : null, status].filter(Boolean).join(' · ')
  );
  let all = $derived<MenuItem[]>([
    ...items,
    ...(items.length ? (['separator'] as MenuItem[]) : []),
    {
      label: open ? m.devices.hideDevices : m.devices.showDevices(radiator.devices.length),
      icon: 'list',
      onselect: () => (open = !open)
    }
  ]);
</script>

<li class="radiator">
  <div class="top">
    <PendingEdge pending={pending?.status === 'sending' || pending?.status === 'pending'} confirmed={pending?.status === 'confirmed'} />
    <span class="glyph" class:off={reachable === false} aria-hidden="true"><Icon name={reachable === false ? 'plug-off' : 'rad'} size={18} /></span>
    <div class="who">
      <span class="name">{name} <SupportChip support={radiator.support} /></span>
      {#if line}<span class="line" class:off={reachable === false}>{line}</span>{/if}
    </div>
    <Menu label={m.devices.actionsFor(facts.model ? `${name} (${facts.model})` : name)} items={all} />
  </div>
  {@render children?.()}
  {#if open}
    <ul class="devices" id="{uid}-devices" aria-label={m.devices.devicesOf(name)}>
      {#each radiator.devices as d (d.id)}
        <DeviceRow device={d} {now}>{@render deviceActions?.(d)}</DeviceRow>
      {/each}
    </ul>
  {/if}
</li>

<style>
  .radiator {
    list-style: none;
    border-top: 1px solid var(--line);
  }
  .top {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 0;
  }
  .glyph {
    display: grid;
    flex: none;
    color: var(--mu);
  }
  .glyph.off {
    color: var(--fa);
  }
  .who {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .line {
    font-size: 12.5px;
    color: var(--mu);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .devices {
    margin: 0 0 8px;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--line);
    list-style: none;
  }
</style>
