<!-- Réglages › Pièces et appareils (Tableau §4, mockups 5): the lead and the SyncLine with « Synchroniser »,
     « Nouvelle pièce », one grouped list per Cozytouch room with its « ⋯ » (Renommer la pièce, Supprimer la pièce
     with its reason) and its radiators, each with its « ⋯ » (Renommer, Déplacer vers…, Faire clignoter, Voir les
     appareils); then « Box et pont Cozytouch » and the other devices. On a phone the menus are action sheets. On
     an experimental server there is no action and the page says « lecture seule sur ce serveur ». Writes go only
     through the existing setup routes; actions follow the capabilities. The page renders once the setup and the
     home's server (/auth/me) are both known (skeleton until then; error + retry when one fails). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import RoomBlock from '$lib/components/devices/RoomBlock.svelte';
  import StrayNotice from '$lib/components/devices/StrayNotice.svelte';
  import SyncLine from '$lib/components/devices/SyncLine.svelte';
  import type { Pending, SetupDevice, SetupRadiator, SetupRoom } from '$lib/api/types';
  import { retry } from '$lib/actions';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import DeleteRoomDialog from '$lib/components/devices/DeleteRoomDialog.svelte';
  import LabelForm from '$lib/components/devices/LabelForm.svelte';
  import MoveDialog from '$lib/components/devices/MoveDialog.svelte';
  import AppliancesBlock from '$lib/components/devices/AppliancesBlock.svelte';
  import { canEditSetup, capsOf, isReadOnly } from '$lib/capabilities';
  import { run } from '$lib/actions';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import BridgeRow from '$lib/components/devices/BridgeRow.svelte';
  import type { MenuItem } from '$lib/components/Menu.svelte';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { radiatorName } from '$lib/setup';
  import { installUndo, runSetup } from '$lib/setupActions';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';

  const REFRESH_MS = 30_000; // memory only on the server: no Overkiz call
  let now = $state(Date.now());
  let failed = $state(false);

  async function load(): Promise<void> {
    try {
      house.applySetup(await api.setupDevices());
      failed = false;
    } catch {
      failed = house.setup === null;
    }
  }

  onMount(() => {
    installUndo();
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      now = Date.now();
      void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  });

  // Rendered once with everything it depends on: the setup and the home's server (/auth/me),
  // which decides the setup actions. Shown piecemeal, the actions arrived after the rooms and
  // pushed them down (CLS, CI 2026-10-15).
  let setup = $derived(auth.loggedIn === null ? null : house.setup);
  // /auth/me failed (not merely late): the skeleton would never resolve, so say it and offer a retry.
  let unavailable = $derived(failed || (auth.loggedIn === null && auth.meFailed));
  function retryAll(): void {
    void load();
    if (auth.loggedIn === null) void auth.refresh();
  }
  // Plan 12: rooms and devices are written on the Cozytouch servers only.
  let editable = $derived(canEditSetup(auth.server));
  // The house root is a room only while radiators are in no other room (decision 9).
  let rooms = $derived(setup ? setup.rooms.filter((r) => !r.is_root || r.radiator_ids.length) : []);

  const ACTIVE = new Set(['sending', 'pending']);
  const active = (p?: Pending) => !!p && ACTIVE.has(p.status);
  let creating = $state(false);
  let createId = $state<string | null>(null);
  let editing = $state<string | null>(null); // `room:<id>` or `radiator:<id>`
  let createPending = $derived(createId ? house.pending[createId] : undefined);
  let labels = $derived(setup ? setup.rooms.filter((r) => !r.is_root).map((r) => r.name) : []);
  const radiatorPending = (rid: string): Pending | undefined => {
    const p = house.pendingFor([rid]);
    return p?.kind === 'setup' ? p : undefined;
  };
  const toggle = (key: string) => (editing = editing === key ? null : key);

  async function createRoom(label: string): Promise<void> {
    let made: Pending | null = null;
    made = await runSetup(
      () => api.createRoom(label),
      () => api.deleteRoom(made!.room_id!),
      'create'
    );
    if (made) {
      createId = made.id;
      creating = false;
    }
  }

  async function renameRoom(room: SetupRoom, label: string): Promise<void> {
    const before = room.name;
    if (await runSetup(() => api.renameRoom(room.id, label), () => api.renameRoom(room.id, before), `room:${room.id}`)) editing = null;
  }

  async function deleteRoom(room: SetupRoom): Promise<void> {
    const name = room.name; // the undo recreates it with the same name (and the house's room type)
    await runSetup(() => api.deleteRoom(room.id), () => api.createRoom(name), `room:${room.id}`);
  }

  async function moveRadiator(r: SetupRadiator, roomId: string): Promise<void> {
    const from = setup?.rooms.find((x) => x.id === r.room_id);
    const undo = from && !from.is_root ? () => api.moveRadiator(r.id, from.id) : undefined;
    await runSetup(() => api.moveRadiator(r.id, roomId), undo, `radiator:${r.id}`);
  }

  // The « ⋯ » menus (UX batch 10): every action of the room and of the radiator, a reason when one cannot run.
  let deleters = $state<Record<string, DeleteRoomDialog>>({});
  let movers = $state<Record<string, MoveDialog>>({});
  const BLOCK: Record<string, () => string> = { room_not_empty: () => m.devices.emptyFirst, room_protected: () => m.devices.protectedRoom };
  function roomItems(room: SetupRoom): MenuItem[] {
    if (room.is_root || !editable) return [];
    const busy = active(house.pendingForRoom(room.id));
    return [
      { label: m.devices.renameRoom, icon: 'edit', disabled: busy ? m.devices.busy : null, onselect: () => toggle(`room:${room.id}`) },
      'separator',
      {
        label: m.devices.deleteRoom, icon: 'trash', danger: true,
        disabled: room.block ? BLOCK[room.block]() : busy ? m.devices.busy : null,
        onselect: () => deleters[room.id]?.open()
      }
    ];
  }
  function radiatorItems(r: SetupRadiator): MenuItem[] {
    const live = house.radiators[r.id];
    const busy = active(radiatorPending(r.id));
    const items: MenuItem[] = [];
    if (editable) {
      const others = (setup?.rooms ?? []).some((x) => !x.is_root && x.id !== r.room_id);
      items.push(
        { label: m.devices.rename, icon: 'edit', disabled: busy ? m.devices.busy : null, onselect: () => toggle(`radiator:${r.id}`) },
        {
          label: m.devices.moveTo, icon: 'arrow-right', disabled: !others ? m.devices.noOtherRoom : busy ? m.devices.busy : null,
          onselect: () => movers[r.id]?.open()
        }
      );
    }
    if (live && capsOf(live).identify && !isReadOnly(live)) {
      items.push({
        label: m.devices.blink, icon: 'flash', disabled: !house.online ? m.devices.waiting : live.reachable === false ? m.devices.offline : null,
        onselect: () => void run(() => api.identify(r.id))
      });
    }
    return items;
  }

  async function renameRadiator(r: SetupRadiator, name: string): Promise<void> {
    // The undo restores the heater's exact Cozytouch label, not the shown name (which falls back
    // to the device name when the label is Cozytouch's generic one).
    const before = r.devices.find((d) => d.role === 'heater')?.label || r.name;
    const sent = await runSetup(
      () => api.renameRadiator(r.id, name),
      () => api.renameRadiator(r.id, before),
      `radiator:${r.id}`
    );
    if (sent) editing = null;
  }
</script>

<svelte:head><title>{m.page.title(m.devices.title)}</title></svelte:head>

<div class="page">
<SettingsHeader back bare title={m.devices.title} vt="home-devices">
  {#snippet actions()}
    {#if setup && editable && desktop.matches}
      <button type="button" class="btn" aria-expanded={creating} onclick={() => (creating = !creating)}><Icon name="plus" size={16} />{m.devices.newRoom}</button>
    {/if}
  {/snippet}
</SettingsHeader>
{#if !setup}
  <p class="intro">{m.devices.intro}</p>
  {#if unavailable}
    <p class="error" role="alert">{m.devices.loadFailed} <button type="button" class="btn btn-sm" onclick={retryAll}>{m.devices.reload}</button></p>
  {:else}
    <div class="stack" aria-busy="true">
      <div class="skeleton block" style:height="44px" aria-hidden="true"></div>
      {#each [170, 114, 114] as h, i (i)}<div class="skeleton block" style:height="{h}px" aria-hidden="true"></div>{/each}
    </div>
  {/if}
{:else}
  <p class="intro">{auth.server && !editable ? m.devices.introExperimental(auth.server.name) : m.devices.intro}</p>
  {#if auth.server && !editable}<p class="ro">{m.home.readOnlyServer}</p>{/if}
  {#if editable && !desktop.matches}
    <button type="button" class="btn btn-lg new-phone" aria-expanded={creating} onclick={() => (creating = !creating)}><Icon name="plus" size={16} />{m.devices.newRoom}</button>
  {/if}
  {#if editable && (creating || createPending)}<div class="new">
    {#if creating}
      <LabelForm name={m.devices.newRoomField} kind="room" existing={labels} submitText={m.devices.create}
        busy={active(createPending)} onsubmit={createRoom} oncancel={() => (creating = false)} />
    {/if}
    <PendingTag pending={createPending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
  </div>{/if}
  {#if setup.sync}<SyncLine sync={setup.sync} {now} />{/if}
  {#each rooms as room (room.id)}
    <RoomBlock {room} radiators={setup.radiators.filter((r) => r.room_id === room.id)} {now} items={roomItems(room)} {radiatorItems}
      live={house.radiators} {deviceActions} {radiatorActions} pending={house.pendingForRoom(room.id)} {radiatorPending}
      onrename={editable ? (r) => (editing = `radiator:${r.id}`) : null}>
      {#snippet actions()}
        {#if !room.is_root && editable}
          {@const pending = house.pendingForRoom(room.id)}
          <DeleteRoomDialog bind:this={deleters[room.id]} button={false} {room} busy={active(pending)} ondelete={() => deleteRoom(room)} />
          {#if pending}<div class="tag"><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>{/if}
          {#if editing === `room:${room.id}`}
            <LabelForm name={m.devices.roomField} initial={room.name} kind="room" existing={labels.filter((n) => n !== room.name)}
              submitText={m.devices.save} busy={active(pending)} onsubmit={(v) => renameRoom(room, v)} oncancel={() => (editing = null)} />
          {/if}
        {/if}
      {/snippet}
    </RoomBlock>
  {/each}
  <section aria-labelledby="bridges-title">
    <h2 id="bridges-title" class="grph">{m.devices.bridges}</h2>
    <ul class="grp bridges">
      {#each setup.bridges as d (d.id)}<BridgeRow device={d} {now} icon={d.role === 'box' ? 'box' : d.role === 'bridge' ? 'sync' : null} />{/each}
    </ul>
  </section>
  <AppliancesBlock devices={setup.appliances ?? []} {now} />
{/if}
</div>

{#snippet deviceActions(d: SetupDevice)}
  {#if d.misplaced}
    {@const rid = d.id.split('#')[0]}
    <StrayNotice device={d} pending={house.pendingFor([rid])?.label_code === 'setup_tidy' ? house.pendingFor([rid]) : undefined} />
  {/if}
{/snippet}

{#snippet radiatorActions(r: SetupRadiator)}
  {@const pending = radiatorPending(r.id)}
  {#if editable}
    <MoveDialog bind:this={movers[r.id]} button={false} radiator={r} rooms={setup?.rooms ?? []} busy={active(pending)} onmove={(id) => moveRadiator(r, id)} />
    {#if pending}<div class="tag"><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>{/if}
  {/if}
  {#if editable && editing === `radiator:${r.id}`}
    <LabelForm name={m.devices.radiatorField} initial={radiatorName(r)} kind="device" submitText={m.devices.save}
      busy={active(pending)} onsubmit={(v) => renameRadiator(r, v)} oncancel={() => (editing = null)} />
  {/if}
{/snippet}

<style>
  .page {
    display: grid;
    gap: 14px;
    max-width: 760px;
    min-width: 0;
  }
  .page > :global(.sh) {
    margin-bottom: 0;
  }
  .stack {
    display: grid;
    gap: 14px;
  }
  .new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .new-phone {
    width: 100%;
  }
  .tag {
    padding-bottom: 8px;
  }
  .intro {
    margin: -10px 0 0;
    font-size: 13.5px;
    color: var(--mu);
  }
  .ro {
    margin: -8px 0 0;
    font-size: var(--fs-note);
    color: var(--mu);
  }
  .grph {
    margin-top: 4px;
  }
  .bridges {
    margin: 0;
  }
  .error {
    font-size: 13px;
  }
</style>
