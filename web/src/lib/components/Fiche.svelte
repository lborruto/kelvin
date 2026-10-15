<!-- The exact value behind a figure (direction-2 §1.2, DESIGN « Fiche »): L1 of « data on demand ».
     Desktop (≥ 1024 px): a 280 px card (s2, hairline, radius 10, flat) beside its trigger, flipped left near
     the edge and clamped in the viewport, a non-modal role="dialog" named by its title; pinned, it takes
     the pointer and shows a close button. Phone: the same content in the shared bottom sheet (ChoiceSheet).
     Usually driven by Fig (hover intent, pin, Esc); see .superpowers/sdd/ux/foundation-api.md. -->
<script lang="ts" module>
  export const FICHE_W = 280;
  const GAP = 8;
  const EDGE = 8;

  /** Where the card goes: right of the trigger, else left of it, else clamped; top aligned, kept on screen. */
  export function fichePlace(
    anchor: { left: number; right: number; top: number; bottom: number },
    card: { width: number; height: number },
    view: { width: number; height: number }
  ): { left: number; top: number } {
    let left = anchor.right + GAP;
    if (left + card.width > view.width - EDGE) left = anchor.left - GAP - card.width;
    if (left < EDGE) left = Math.max(EDGE, Math.min(view.width - EDGE - card.width, anchor.left));
    const top = Math.max(EDGE, Math.min(anchor.top - 6, view.height - EDGE - card.height));
    return { left, top };
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { dur, T } from '$lib/motion';
  import { portal } from '$lib/portal';
  import type { Provenance } from '$lib/provenance';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import FicheBody, { type FicheAction, type FicheRow } from './FicheBody.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    open: boolean;
    /** Pinned (click, tap, Enter): the card takes the pointer and shows its close button. */
    pinned?: boolean;
    /** The figure that opened it: the card sits beside it and focus goes back to it. */
    anchor?: HTMLElement | null;
    id: string;
    title: string;
    rows?: FicheRow[];
    empty?: string | null;
    notes?: string[];
    provenance?: Provenance | null;
    action?: FicheAction | null;
    /** Move focus into the card when it opens pinned from the keyboard. */
    focusOnOpen?: boolean;
    /** Esc, the close button, a click outside or the sheet closing. */
    onclose: () => void;
    /** The pointer entered / left the card (Fig keeps a hovered card open). */
    onenter?: () => void;
    onleave?: () => void;
  }
  let {
    open, pinned = false, anchor = null, id, title, rows = [], empty = null, notes = [], provenance = null, action = null,
    focusOnOpen = false, onclose, onenter, onleave
  }: Props = $props();

  let card = $state<HTMLDivElement>();
  let closeBtn = $state<HTMLButtonElement>();
  let pos = $state({ left: -9999, top: 0 });
  let mode = $derived<'card' | 'sheet'>(desktop.matches ? 'card' : 'sheet');

  function place() {
    if (!anchor || !card) return;
    const a = anchor.getBoundingClientRect();
    pos = fichePlace(a, { width: card.offsetWidth || FICHE_W, height: card.offsetHeight }, { width: innerWidth, height: innerHeight });
  }

  $effect(() => {
    if (!open || mode !== 'card' || !card) return;
    place();
    const on = () => place();
    addEventListener('scroll', on, true);
    addEventListener('resize', on);
    return () => {
      removeEventListener('scroll', on, true);
      removeEventListener('resize', on);
    };
  });

  $effect(() => {
    if (open && pinned && focusOnOpen && mode === 'card') void tick().then(() => closeBtn?.focus());
  });

  // A pinned card closes on a press anywhere else (not on its trigger, which toggles it itself).
  $effect(() => {
    if (!open || !pinned || mode !== 'card') return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && !card?.contains(t) && !anchor?.contains(t)) onclose();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    anchor?.focus();
    onclose();
  }
  /** Keyboard focus leaving the card closes it (focus is never stranded on a hidden card). */
  function onfocusout(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (to && !card?.contains(to) && !anchor?.contains(to)) onclose();
  }
</script>

{#if mode === 'card'}
  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      use:portal
      bind:this={card}
      {id}
      class="fiche"
      class:pinned
      role="dialog"
      aria-modal="false"
      aria-labelledby="{id}-title"
      tabindex="-1"
      style:left="{pos.left}px"
      style:top="{pos.top}px"
      style:width="{FICHE_W}px"
      {onkeydown}
      {onfocusout}
      onpointerenter={() => onenter?.()}
      onpointerleave={() => onleave?.()}
      transition:fade|global={{ duration: dur(T.state) }}>
      {#if pinned}
        <button bind:this={closeBtn} type="button" class="btn btn-icon x" aria-label={m.fiche.close}
          onclick={() => { anchor?.focus(); onclose(); }}><Icon name="x" size={16} /></button>
      {/if}
      <FicheBody {title} titleId="{id}-title" {rows} {empty} {notes} {provenance} {action} />
    </div>
  {/if}
{:else}
  <ChoiceSheet {title} {open} trigger={anchor} {onclose}>
    <div class="sheet-body" {id}>
      <FicheBody {rows} {empty} {notes} {provenance} {action} />
    </div>
  </ChoiceSheet>
{/if}

<style>
  /* Flat like every surface (DESIGN Elevation): s2, a hairline, no shadow. Fixed: placed in the viewport. */
  .fiche {
    position: fixed;
    z-index: 60;
    padding: 10px 12px;
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--tx);
    font-size: 13px;
    line-height: 1.45;
    text-align: left;
  }
  .fiche:focus {
    outline: none;
  }
  .fiche.pinned {
    padding-right: 40px;
  }
  .x {
    position: absolute;
    top: 2px;
    right: 2px;
  }
  .sheet-body {
    font-size: 13px;
  }
</style>
