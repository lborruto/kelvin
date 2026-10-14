<script lang="ts">
  import { retry, runHouse } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { house } from '$lib/stores/house.svelte';
  import Icon from './Icon.svelte';
  import PendingTag from './PendingTag.svelte';

  interface Props {
    /** Full-width, one per line (the desktop sidebar). */
    stacked?: boolean;
    /** Also offer "Tout remettre en programme" (Maison). */
    program?: boolean;
  }
  let { stacked = false, program = false }: Props = $props();
  // Mounted several times at once (sidebar, phone header, Maison): ids must be unique.
  const uid = $props.id();

  let dialog = $state<HTMLDialogElement>();
  let pending = $derived(house.houseCommand);
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');
  async function allOff() {
    dialog?.close();
    await runHouse(() => api.houseOff());
  }
</script>

<div class="wrap" class:stacked>
  <div class="actions" class:stacked>
    <button type="button" disabled={busy} onclick={() => dialog?.showModal()}><Icon name="power" size={16} />Tout éteindre</button>
    {#if program}
      <button type="button" disabled={busy} onclick={() => runHouse(() => api.houseProgram())}>Tout remettre en programme</button>
    {/if}
    <a href="/maison#absence"><Icon name="away" size={16} />Absence…</a>
  </div>
  <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
</div>

<dialog bind:this={dialog} aria-labelledby="{uid}-all-off-title">
  <p id="{uid}-all-off-title">Mettre tous les radiateurs à l’arrêt ?</p>
  <div class="row">
    <button type="button" onclick={() => dialog?.close()}>Annuler</button>
    <button type="button" class="danger" onclick={allOff}>Tout éteindre</button>
  </div>
</dialog>

<style>
  .wrap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .wrap.stacked {
    flex-direction: column;
    align-items: stretch;
  }
  .actions > :disabled {
    cursor: default;
    opacity: 0.6;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stacked {
    flex-direction: column;
  }
  .stacked > * {
    width: 100%;
  }
  .actions > * {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--s1);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  dialog {
    background: var(--s1);
    color: var(--tx);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    max-width: 340px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .row button {
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--s2);
    cursor: pointer;
  }
  .danger {
    background: color-mix(in srgb, var(--bad) 25%, var(--s2)) !important;
  }
</style>
