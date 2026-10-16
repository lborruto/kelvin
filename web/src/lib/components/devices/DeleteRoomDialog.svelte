<script lang="ts">
  import type { SetupRoom } from '$lib/api/types';
  import { apiMessage, m } from '$lib/i18n';
  import Sheet from './Sheet.svelte';

  interface Props {
    room: SetupRoom;
    busy?: boolean;
    /** May return the write's promise: the trigger waits for it. */
    ondelete: () => unknown;
    /** Its own trigger button; false when a Menu opens it (`open()`). */
    button?: boolean;
  }
  let { room, busy = false, ondelete, button = true }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let cancel = $state<HTMLButtonElement>();
  let reason = $state<string | null>(null);
  let submitting = $state(false);
  // Closed, still fading out: its buttons must not send a second time.
  let closing = $state(false);
  let paused = $derived(busy || submitting || room.block !== null);

  function ask(): void {
    if (room.block !== null) {
      reason = apiMessage(room.block); // say why; focus stays on the button
      return;
    }
    if (busy || submitting) return;
    closing = false;
    dialog?.showModal();
    cancel?.focus(); // the safe choice
  }

  /** Opened from the room's « ⋯ » menu (the menu already says why a protected or full room cannot go). */
  export function open(): void {
    ask();
  }

  function confirmDelete(): void {
    if (closing) return;
    closing = true;
    dialog?.close();
    const sent = ondelete();
    if (sent instanceof Promise) {
      submitting = true;
      void sent.finally(() => (submitting = false));
    }
  }
</script>

{#if button}
  <button type="button" class="btn btn-sm btn-ghost" aria-disabled={paused} aria-describedby={reason ? `${uid}-why` : undefined} onclick={ask}>
    {m.devices.deleteRoom}
  </button>
  <span class="why" id="{uid}-why" aria-live="polite">{reason ?? ''}</span>
{/if}

<Sheet bind:dialog title={m.devices.deleteTitle(room.name)} description={m.devices.deleteBody}>
  <div class="row">
    <button type="button" class="btn" bind:this={cancel} onclick={() => dialog?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-danger" aria-disabled={closing} onclick={confirmDelete}>{m.devices.deleteRoom}</button>
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
