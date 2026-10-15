<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import RoomBlock from '$lib/components/devices/RoomBlock.svelte';
  import DeviceRow from '$lib/components/devices/DeviceRow.svelte';
  import StrayNotice from '$lib/components/devices/StrayNotice.svelte';
  import SyncLine from '$lib/components/devices/SyncLine.svelte';
  import type { SetupDevice } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { installUndo } from '$lib/setupActions';
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

  let setup = $derived(house.setup);
  // The house root is a room only while radiators are in no other room (decision 9).
  let rooms = $derived(setup ? setup.rooms.filter((r) => !r.is_root || r.radiator_ids.length) : []);
</script>

<svelte:head><title>{m.page.title(m.devices.title)}</title></svelte:head>

<a class="back btn btn-ghost" href={ROUTES.home}><Icon name="arrow-left" size={16} />{m.devices.home}</a>
<h1>{m.devices.title}</h1>
<p class="intro">{m.devices.intro}</p>

{#if !setup}
  {#if failed}
    <p class="error" role="alert">{m.devices.loadFailed} <button type="button" class="btn btn-sm" onclick={load}>{m.devices.reload}</button></p>
  {:else}
    <div aria-busy="true">
      {#each [150, 110, 110] as h, i (i)}<div class="skeleton block" style:height="{h}px" aria-hidden="true"></div>{/each}
      <div class="skeleton block" style:height="120px" aria-hidden="true"></div>
    </div>
  {/if}
{:else}
  {#if setup.sync}<SyncLine sync={setup.sync} {now} />{/if}
  {#each rooms as room (room.id)}
    <RoomBlock {room} radiators={setup.radiators.filter((r) => r.room_id === room.id)} {now} {deviceActions} />

  {/each}
  <section class="panel" aria-labelledby="bridges-title">
    <h2 id="bridges-title">{m.devices.bridges}</h2>
    <ul class="bridges">
      {#each setup.bridges as d (d.id)}<DeviceRow device={d} {now} />{/each}
    </ul>
  </section>
{/if}

{#snippet deviceActions(d: SetupDevice)}
  {#if d.misplaced}
    {@const rid = d.id.split('#')[0]}
    <StrayNotice device={d} pending={house.pendingFor([rid])?.label_code === 'setup_tidy' ? house.pendingFor([rid]) : undefined} />
  {/if}
{/snippet}

<style>
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
