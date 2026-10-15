<script lang="ts">
  import { retry, runHouse } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { m } from '$lib/i18n';
  import { ANCHORS, ROUTES } from '$lib/paths';
  import { house } from '$lib/stores/house.svelte';
  import Icon from './Icon.svelte';
  import PendingTag from './PendingTag.svelte';

  interface Props {
    /** Full-width, one per line (the desktop sidebar). */
    stacked?: boolean;
    /** Also offer "Tout remettre en programme" (Maison). */
    program?: boolean;
    /** The « Absence… » link (not on Maison, where the Absence panel is the page itself). */
    away?: boolean;
    /** One row whatever the font (the Rooms header on a phone): a label that does not fit ends in « … »
        instead of wrapping the row, so a late web font or a wider fallback never moves the page (CLS). */
    oneLine?: boolean;
  }
  let { stacked = false, program = false, away = true, oneLine = false }: Props = $props();
  // Mounted several times at once (sidebar, phone header, Maison): ids must be unique.
  const uid = $props.id();

  let dialog = $state<HTMLDialogElement>();
  let pending = $derived(house.houseCommand);
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');
  // Nothing to switch off before the house is known, and no answer could arrive while disconnected.
  // aria-disabled, never disabled: the button that was just pressed keeps keyboard focus.
  let blocked = $derived(busy || !house.online);
  let cancel = $state<HTMLButtonElement>();
  function ask() {
    if (blocked) return;
    dialog?.showModal();
    // The safe choice takes focus.
    cancel?.focus();
  }
  async function allOff() {
    dialog?.close();
    await runHouse(() => api.houseOff());
  }
</script>

<div class="wrap" class:stacked>
  <div class="actions" class:stacked class:one={oneLine}>
    <button type="button" class="btn btn-sm" aria-disabled={blocked} onclick={ask}><Icon name="power" size={16} /><span class="lbl">{m.houseActions.allOff}</span></button>
    {#if program}
      <button type="button" class="btn btn-sm" aria-disabled={blocked} onclick={() => !blocked && runHouse(() => api.houseProgram())}><span class="lbl">{m.houseActions.allProgram}</span></button>
    {/if}
    {#if away}<a class="btn btn-sm" href="{ROUTES.home}#{ANCHORS.away}"><Icon name="away" size={16} /><span class="lbl">{m.houseActions.away}</span></a>{/if}
  </div>
  <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
</div>

<dialog bind:this={dialog} aria-labelledby="{uid}-all-off-title" aria-describedby="{uid}-all-off-body">
  <h2 id="{uid}-all-off-title">{m.houseActions.confirmTitle}</h2>
  <p id="{uid}-all-off-body">{m.houseActions.confirmBody}</p>
  <div class="row">
    <button type="button" class="btn" bind:this={cancel} onclick={() => dialog?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-danger" onclick={allOff}>{m.houseActions.allOff}</button>
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
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stacked {
    flex-direction: column;
  }
  .one {
    flex-wrap: nowrap;
    min-width: 0;
    max-width: 100%;
  }
  .one > :global(.btn) {
    flex: 0 1 auto;
    min-width: 0;
  }
  .one .lbl {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stacked > * {
    width: 100%;
    justify-content: flex-start;
  }
  /* Enter: fade and settle from 8 px below; exit faster, the backdrop fading with it. */
  dialog {
    background: var(--s1);
    color: var(--tx);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    width: min(340px, calc(100vw - 32px));
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: 200ms;
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
  dialog::backdrop {
    background: transparent;
    transition:
      background-color var(--t-exit) ease,
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open]::backdrop {
    background: color-mix(in srgb, var(--bg) 72%, transparent);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  h2 {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 600;
  }
  dialog p {
    margin: 0 0 18px;
    font-size: 13px;
    color: var(--mu);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open] {
      transform: none;
    }
  }
</style>
