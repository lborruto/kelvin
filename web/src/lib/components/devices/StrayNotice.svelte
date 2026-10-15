<script lang="ts">
  import { api } from '$lib/api/client';
  import type { Pending, SetupDevice } from '$lib/api/types';
  import { retry } from '$lib/actions';
  import { m } from '$lib/i18n';
  import { runSetup } from '$lib/setupActions';
  import { house } from '$lib/stores/house.svelte';
  import Icon from '../Icon.svelte';
  import PendingTag from '../PendingTag.svelte';

  interface Props {
    device: SetupDevice;
    pending?: Pending;
  }
  let { device, pending }: Props = $props();
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');

  function tidy(): void {
    if (busy) return;
    void runSetup(() => api.tidyDevice(device.id)); // fixes an inconsistency: no undo
  }
</script>

<div class="stray">
  <p><Icon name="alert" size={14} /> {m.devices.misplaced}</p>
  <div class="row">
    <button type="button" class="btn btn-sm" aria-disabled={busy} onclick={tidy}>{m.devices.tidy}</button>
    <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
  </div>
</div>

<style>
  .stray {
    display: grid;
    gap: 6px;
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--s2);
  }
  p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
