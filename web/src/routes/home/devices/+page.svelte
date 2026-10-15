<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import RoomBlock from '$lib/components/devices/RoomBlock.svelte';
  import DeviceRow from '$lib/components/devices/DeviceRow.svelte';
  import StrayNotice from '$lib/components/devices/StrayNotice.svelte';
  import SyncLine from '$lib/components/devices/SyncLine.svelte';
  import type { Pending, SetupDevice, SetupRadiator, SetupRoom } from '$lib/api/types';
  import { retry } from '$lib/actions';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import DeleteRoomDialog from '$lib/components/devices/DeleteRoomDialog.svelte';
  import LabelForm from '$lib/components/devices/LabelForm.svelte';
  import MoveDialog from '$lib/components/devices/MoveDialog.svelte';
  import AppliancesBlock from '$lib/components/devices/AppliancesBlock.svelte';
  import { canEditSetup } from '$lib/capabilities';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
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

<a class="back btn btn-ghost" href={ROUTES.home}><Icon name="arrow-left" size={16} />{m.devices.home}</a>
<h1>{m.devices.title}</h1>
{#if !setup}
  <p class="intro">{m.devices.intro}</p>
  {#if unavailable}
    <p class="error" role="alert">{m.devices.loadFailed} <button type="button" class="btn btn-sm" onclick={retryAll}>{m.devices.reload}</button></p>
  {:else}
    <div aria-busy="true">
      {#each [150, 110, 110] as h, i (i)}<div class="skeleton block" style:height="{h}px" aria-hidden="true"></div>{/each}
      <div class="skeleton block" style:height="120px" aria-hidden="true"></div>
    </div>
  {/if}
{:else}
  <p class="intro">{auth.server && !editable ? m.devices.introExperimental(auth.server.name) : m.devices.intro}</p>
  {#if setup.sync}<SyncLine sync={setup.sync} {now} />{/if}
  {#if editable}<div class="new">
    {#if creating}
      <LabelForm name={m.devices.newRoomField} kind="room" existing={labels} submitText={m.devices.create}
        busy={active(createPending)} onsubmit={createRoom} oncancel={() => (creating = false)} />
    {:else}
      <button type="button" class="btn btn-sm" onclick={() => (creating = true)}><Icon name="plus" size={16} />{m.devices.newRoom}</button>
    {/if}
    <PendingTag pending={createPending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
  </div>{/if}
  {#each rooms as room (room.id)}
    <RoomBlock {room} radiators={setup.radiators.filter((r) => r.room_id === room.id)} {now} {deviceActions} {radiatorActions}
      pending={house.pendingForRoom(room.id)} {radiatorPending}>
      {#snippet actions()}
        {#if !room.is_root && editable}
          {@const pending = house.pendingForRoom(room.id)}
          <div class="actions">
            <button type="button" class="btn btn-sm btn-ghost" aria-expanded={editing === `room:${room.id}`}
              onclick={() => toggle(`room:${room.id}`)}><Icon name="edit" size={16} />{m.devices.rename}</button>
            <DeleteRoomDialog {room} busy={active(pending)} ondelete={() => deleteRoom(room)} />
            <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
          </div>
          {#if editing === `room:${room.id}`}
            <LabelForm name={m.devices.roomField} initial={room.name} kind="room" existing={labels.filter((n) => n !== room.name)}
              submitText={m.devices.save} busy={active(pending)} onsubmit={(v) => renameRoom(room, v)} oncancel={() => (editing = null)} />
          {/if}
        {/if}
      {/snippet}
    </RoomBlock>

  {/each}
  <section class="panel" aria-labelledby="bridges-title">
    <h2 id="bridges-title">{m.devices.bridges}</h2>
    <ul class="bridges">
      {#each setup.bridges as d (d.id)}<DeviceRow device={d} {now} />{/each}
    </ul>
  </section>
  <AppliancesBlock devices={setup.appliances ?? []} {now} />
{/if}

{#snippet deviceActions(d: SetupDevice)}
  {#if d.misplaced}
    {@const rid = d.id.split('#')[0]}
    <StrayNotice device={d} pending={house.pendingFor([rid])?.label_code === 'setup_tidy' ? house.pendingFor([rid]) : undefined} />
  {/if}
{/snippet}

{#snippet radiatorActions(r: SetupRadiator)}
  {@const pending = radiatorPending(r.id)}
  {#if editable}<div class="actions">
    <button type="button" class="btn btn-sm btn-ghost" aria-expanded={editing === `radiator:${r.id}`}
      onclick={() => toggle(`radiator:${r.id}`)}><Icon name="edit" size={16} />{m.devices.rename}</button>
    <MoveDialog radiator={r} rooms={setup?.rooms ?? []} busy={active(pending)} onmove={(id) => moveRadiator(r, id)} />
    <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
  </div>{/if}
  {#if editable && editing === `radiator:${r.id}`}
    <LabelForm name={m.devices.radiatorField} initial={radiatorName(r)} kind="device" submitText={m.devices.save}
      busy={active(pending)} onsubmit={(v) => renameRadiator(r, v)} oncancel={() => (editing = null)} />
  {/if}
{/snippet}

<style>
  .new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    max-width: 720px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .back {
    margin-bottom: 8px;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 6px;
  }
  .intro {
    font-size: 13px;
    color: var(--mu);
    margin: 0 0 14px;
    max-width: 720px;
  }
  .block {
    max-width: 720px;
    margin-bottom: 14px;
    border-radius: var(--radius);
  }
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
    margin: 0 0 8px;
  }
  .bridges {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .error {
    font-size: 13px;
  }
</style>
