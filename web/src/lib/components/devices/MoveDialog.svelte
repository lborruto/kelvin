<script lang="ts">
  import type { SetupRadiator, SetupRoom } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { radiatorName, roomName } from '$lib/setup';
  import Sheet from './Sheet.svelte';

  interface Props {
    radiator: SetupRadiator;
    rooms: SetupRoom[];
    busy?: boolean;
    /** May return the write's promise: the trigger waits for it. */
    onmove: (roomId: string) => unknown;
    /** Its own trigger button; false when a Menu opens it (`open()`). */
    button?: boolean;
  }
  let { radiator, rooms, busy = false, onmove, button = true }: Props = $props();
  let dialog = $state<HTMLDialogElement>();
  let choice = $state<string | null>(null);
  // Never the house itself (decision 9), never where it already is.
  let targets = $derived(rooms.filter((r) => !r.is_root && r.id !== radiator.room_id));
  let submitting = $state(false);
  // Closed, still fading out: its buttons must not send a second time.
  let closing = $state(false);
  let paused = $derived(busy || submitting || targets.length === 0);

  export function open(): void {
    if (paused) return;
    choice = null;
    closing = false;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
  }

  function move(): void {
    if (!choice || closing) return;
    closing = true;
    dialog?.close();
    const sent = onmove(choice);
    if (sent instanceof Promise) {
      submitting = true;
      void sent.finally(() => (submitting = false));
    }
  }
</script>

{#if button}<button type="button" class="btn btn-sm" aria-disabled={paused} onclick={open}>{m.devices.moveTo}</button>{/if}

<Sheet bind:dialog title={m.devices.moveTitle(radiatorName(radiator))} description={m.devices.moveBody}>
  <fieldset>
    <legend class="visually-hidden">{m.devices.moveLegend}</legend>
    {#each targets as r (r.id)}
      <label class="choice"><input type="radio" name="move-target" value={r.id} bind:group={choice} /> {roomName(r)}</label>
    {/each}
  </fieldset>
  <div class="row">
    <button type="button" class="btn" onclick={() => dialog?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-primary" aria-disabled={!choice || closing} onclick={move}>{m.devices.move}</button>
  </div>
</Sheet>

<style>
  fieldset {
    border: 0;
    margin: 0 0 16px;
    padding: 0;
    display: grid;
    gap: 4px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .choice:has(input:checked) {
    background: var(--s2);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
