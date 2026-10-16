<!-- A menu of actions (direction-2 §1.2, DESIGN « Menu »): a « ⋯ » icon or a labelled ghost trigger that
     opens a popover (desktop: s1, hairline, radius 10, 8 px padding, 44 px items with icon + label, a
     hairline between groups, destructive items in bad text) or the same items in the bottom sheet (phone).
     role="menu" / "menuitem": arrows, Home and End move, Enter or Space activates, Esc and Tab close (Esc
     gives focus back to the trigger). A disabled item stays focusable (aria-disabled) and says why on a
     12 px muted second line. See foundation-api.md. -->
<script lang="ts" module>
  import type { IconName } from './Icon.svelte';

  export interface MenuAction {
    label: string;
    icon?: IconName;
    onselect: () => void;
    /** Why it cannot run now (« Videz d’abord la pièce »): the item stays focusable and says so. */
    disabled?: string | null;
    /** Destructive (« Supprimer la pièce »): bad text. */
    danger?: boolean;
  }
  /** An action, or a hairline between groups. */
  export type MenuItem = MenuAction | 'separator';
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { dur, T } from '$lib/motion';
  import { portal } from '$lib/portal';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** The trigger's accessible name (« Actions pour Salon », « Exporter »); also the phone sheet's title.
     * Defaults to « Plus d’actions ». */
    label?: string;
    items: MenuItem[];
    /** Visible trigger text (a ghost button « Exporter »); without it the trigger is a 36 px « ⋯ » icon button. */
    text?: string | null;
    icon?: IconName;
    /** A muted, non-interactive last line (the CSV format). */
    footer?: string | null;
    class?: string;
  }
  let { label, items, text = null, icon = text ? undefined : 'more', footer = null, class: cls = '' }: Props = $props();
  const uid = $props.id();
  // The fallback name follows a language switch.
  let name = $derived(label ?? m.menu.more);

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let pop = $state<HTMLDivElement>();
  let list = $state<HTMLElement>();
  let pos = $state({ left: -9999, top: 0 });
  let mode = $derived<'popover' | 'sheet'>(desktop.matches ? 'popover' : 'sheet');

  const buttons = () => [...(list?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  function place() {
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - 8 - w, r.right - w));
    const below = r.bottom + 4;
    const top = below + h > innerHeight - 8 && r.top - 4 - h >= 8 ? r.top - 4 - h : below;
    pos = { left, top };
  }

  async function show() {
    open = true;
    await tick();
    if (mode === 'popover') place();
    buttons()[0]?.focus();
  }
  function hide(refocus = true) {
    open = false;
    if (refocus) trigger?.focus();
  }

  $effect(() => {
    if (!open || mode !== 'popover') return;
    const on = () => place();
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && !pop?.contains(t) && !trigger?.contains(t)) hide(false);
    };
    addEventListener('scroll', on, true);
    addEventListener('resize', on);
    document.addEventListener('pointerdown', down, true);
    return () => {
      removeEventListener('scroll', on, true);
      removeEventListener('resize', on);
      document.removeEventListener('pointerdown', down, true);
    };
  });

  function onkeydown(e: KeyboardEvent) {
    const all = buttons();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % all.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key === 'Escape' && mode === 'popover') {
      e.preventDefault();
      e.stopPropagation();
      return hide();
    } else if (e.key === 'Tab' && mode === 'popover') {
      // Menu-button pattern: focus back on the trigger, then the browser's own Tab moves on from there
      // (the popover is portalled to <body>, so Tab from inside it would leave the page).
      return hide();
    }
    if (next < 0) return;
    e.preventDefault();
    all[next]?.focus();
  }

  function choose(a: MenuAction) {
    if (a.disabled) return;
    hide();
    a.onselect();
  }
  function ontrigger(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      void show();
    }
  }
</script>

{#snippet menu()}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div bind:this={list} class="items" role="menu" aria-labelledby="{uid}-trigger" {onkeydown}>
    {#each items as item, i (i)}
      {#if item === 'separator'}
        <div class="sep" role="separator"></div>
      {:else}
        {@const why = item.disabled ? `${uid}-why-${i}` : undefined}
        <button type="button" role="menuitem" tabindex="-1" class="item" class:danger={item.danger}
          aria-disabled={item.disabled ? 'true' : undefined} aria-describedby={why} onclick={() => choose(item)}>
          <span class="ic" aria-hidden="true">{#if item.icon}<Icon name={item.icon} size={16} />{/if}</span>
          <span class="txt"><span class="lab">{item.label}</span>{#if item.disabled}<span class="why" id={why}>{item.disabled}</span>{/if}</span>
        </button>
      {/if}
    {/each}
  </div>
  {#if footer}<p class="foot">{footer}</p>{/if}
{/snippet}

<button
  bind:this={trigger}
  id="{uid}-trigger"
  type="button"
  class="btn {text ? 'btn-ghost' : 'btn-icon edged'} trigger {cls}"
  aria-label={text ? undefined : name}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? `${uid}-menu` : undefined}
  onclick={() => (open ? hide(false) : show())}
  onkeydown={ontrigger}>
  {#if icon}<Icon name={icon} size={18} />{/if}{#if text}{text}{/if}
</button>

{#if mode === 'popover'}
  {#if open}
    <div use:portal bind:this={pop} id="{uid}-menu" class="pop" style:left="{pos.left}px" style:top="{pos.top}px"
      transition:fade|global={{ duration: dur(T.state) }}>
      {@render menu()}
    </div>
  {/if}
{:else}
  <ChoiceSheet title={name} {open} {trigger} onclose={() => (open = false)}>
    <div id="{uid}-menu" class="in-sheet">{@render menu()}</div>
  </ChoiceSheet>
{/if}

<style>
  .trigger.edged {
    border-color: var(--line);
  }
  .pop {
    position: fixed;
    z-index: 60;
    min-width: 220px;
    max-width: min(320px, calc(100vw - 16px));
    padding: 8px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--tx);
    font-size: 13px;
  }
  .items {
    display: grid;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 4px 10px;
    border: 0;
    border-radius: var(--ctl-radius);
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--t-state) ease;
  }
  .item:focus-visible {
    outline-offset: -2px;
  }
  @media (hover: hover) {
    .item:not([aria-disabled='true']):hover {
      background: var(--s2);
    }
  }
  .item:focus {
    background: var(--s2);
  }
  .item.danger {
    color: var(--bad);
  }
  .item[aria-disabled='true'] {
    color: var(--fa);
    cursor: default;
  }
  .ic {
    display: grid;
    flex: none;
    width: 16px;
    color: var(--mu);
  }
  .danger .ic {
    color: inherit;
  }
  .txt {
    display: grid;
    min-width: 0;
  }
  .why {
    font-size: 12px;
    color: var(--mu);
  }
  .sep {
    height: 1px;
    margin: 4px 0;
    background: var(--line);
  }
  .foot {
    margin: 4px 0 0;
    padding: 6px 10px 2px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--mu);
  }
  .in-sheet .item {
    padding-inline: 4px;
  }
</style>
