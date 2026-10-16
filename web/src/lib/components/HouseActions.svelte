<script lang="ts">
  import { retry, runHouse } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtWeekdayTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { house } from '$lib/stores/house.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import PendingTag from './PendingTag.svelte';

  interface Props {
    /** Full-width, one per line (the desktop sidebar). */
    stacked?: boolean;
    /** Also offer "Tout remettre en programme" (Maison). */
    program?: boolean;
    /** The « Absence… » button: it opens the Absence sheet where the user is. */
    away?: boolean;
    /** The away button's idle text (Maison: « Partir en absence… »). */
    awayText?: string;
    /** Icon buttons with their names as labels (the phone Rooms header): one row whatever the font or language. */
    icons?: boolean;
    /** Maison's header (Tableau §4): desktop 40 px buttons in the mockup's order (Partir…, Tout éteindre, Tout
     * remettre en programme), « Tout éteindre » left out while everything is off (`allOff`). */
    maison?: boolean;
    /** Maison's phone header: the away icon and a « ⋯ » menu holding Tout éteindre / Tout remettre en programme. */
    menu?: boolean;
    allOff?: boolean;
  }
  let { stacked = false, program = false, away = true, awayText, icons = false, maison = false, menu = false, allOff: everythingOff = false }: Props = $props();
  // While an absence runs, the button says so in cool (« Absence · dim. 18:00 ») and opens it.
  let awayOn = $derived(house.away);
  let awayLabel = $derived(awayOn ? m.away.short(fmtWeekdayTime(awayOn.ends_at * 1000)) : (awayText ?? m.houseActions.away));
  const openAway = (e: MouseEvent) => awaySheet.show(e.currentTarget as HTMLElement);
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
  <div class="actions" class:stacked>
    {#if menu}
      {#if away}<button type="button" class="btn btn-icon edged" class:on={!!awayOn} aria-label={awayLabel} title={awayLabel}
          onclick={openAway}><Icon name="away" size={18} />{#if awayOn}<span class="adot" aria-hidden="true"></span>{/if}</button>{/if}
      <Menu label={m.maison.more} items={[
        { label: m.houseActions.allOff, icon: 'power', onselect: ask, disabled: blocked ? (house.online ? m.away.busy : m.away.waiting) : null },
        { label: m.houseActions.allProgram, icon: 'resume', onselect: () => !blocked && runHouse(() => api.houseProgram()),
          disabled: blocked ? (house.online ? m.away.busy : m.away.waiting) : null }
      ]} />
    {:else if maison}
      {#if away}<button type="button" class="btn" class:on={!!awayOn} onclick={openAway}><Icon name="away" size={16} />{awayLabel}</button>{/if}
      {#if !everythingOff}<button type="button" class="btn" aria-disabled={blocked} onclick={ask}><Icon name="power" size={16} />{m.houseActions.allOff}</button>{/if}
      <button type="button" class="btn" aria-disabled={blocked} onclick={() => !blocked && runHouse(() => api.houseProgram())}><Icon
          name="resume" size={16} />{m.houseActions.allProgram}</button>
    {:else if icons}
      <button type="button" class="btn btn-icon edged" aria-label={m.houseActions.allOff} title={m.houseActions.allOff} aria-disabled={blocked}
        onclick={ask}><Icon name="power" size={18} /></button>
      {#if away}<button type="button" class="btn btn-icon edged" class:on={!!awayOn} aria-label={awayLabel} title={awayLabel}
          onclick={openAway}><Icon name="away" size={18} />{#if awayOn}<span class="adot" aria-hidden="true"></span>{/if}</button>{/if}
    {:else}
    {#if away}<button type="button" class="btn btn-sm" class:on={!!awayOn} onclick={openAway}><Icon name="away" size={16} />{awayLabel}</button>{/if}
    {#if program}
      <button type="button" class="btn btn-sm" aria-disabled={blocked} onclick={() => !blocked && runHouse(() => api.houseProgram())}><Icon
          name="program" size={16} />{m.houseActions.allProgram}</button>
    {/if}
    <button type="button" class="btn btn-sm" aria-disabled={blocked} onclick={ask}><Icon name="power" size={16} />{m.houseActions.allOff}</button>
    {/if}
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
  /* The icon form: round s2 buttons, like the mockups' phone header. */
  .edged,
  .actions :global(.trigger.edged) {
    background: var(--s2);
    color: var(--tx);
  }
  .stacked > * {
    width: 100%;
    justify-content: flex-start;
  }
  /* An absence running: the away button reads its end in cool (the only cool outside room surfaces). */
  .on {
    color: var(--cool);
  }
  .btn-icon.on {
    position: relative;
  }
  .adot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--cool);
  }
  /* Enter: fade and settle from 8 px below; exit faster, the backdrop fading with it. */
  dialog {
    background: var(--pop);
    color: var(--tx);
    border: 0;
    border-radius: var(--r-pop);
    box-shadow: var(--shadow-pop);
    padding: 22px;
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
    background: var(--scrim);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  h2 {
    margin: 0 0 6px;
    font-size: 17px;
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
