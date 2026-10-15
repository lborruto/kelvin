<script lang="ts">
  import type { SetupRoom } from '$lib/api/types';
  import { apiMessage, m } from '$lib/i18n';
  import Sheet from './Sheet.svelte';

  interface Props {
    room: SetupRoom;
    busy?: boolean;
    ondelete: () => void;
  }
  let { room, busy = false, ondelete }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let cancel = $state<HTMLButtonElement>();
  let reason = $state<string | null>(null);
  let paused = $derived(busy || room.block !== null);

  function ask(): void {
    if (room.block !== null) {
      reason = apiMessage(room.block); // say why; focus stays on the button
      return;
    }
    if (busy) return;
    dialog?.showModal();
    cancel?.focus(); // the safe choice
  }

  function confirmDelete(): void {
    dialog?.close();
    ondelete();
  }
</script>

<button type="button" class="btn btn-sm btn-ghost" aria-disabled={paused} aria-describedby={reason ? `${uid}-why` : undefined} onclick={ask}>
  {m.devices.deleteRoom}
</button>
<span class="why" id="{uid}-why" aria-live="polite">{reason ?? ''}</span>

<Sheet bind:dialog title={m.devices.deleteTitle(room.name)} description={m.devices.deleteBody}>
  <div class="row">
    <button type="button" class="btn" bind:this={cancel} onclick={() => dialog?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-danger" onclick={confirmDelete}>{m.devices.deleteRoom}</button>
  </div>
</Sheet>

<style>
  .why:empty {
    display: none;
  }
  .why {
    flex-basis: 100%;
    font-size: 12px;
    color: var(--mu);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
