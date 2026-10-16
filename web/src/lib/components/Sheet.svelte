<!-- The Tableau sheet (spec §1 « Motion », §3 « RoomSheet », « Menu / ActionSheet »): one modal surface for the
     whole app. A native modal <dialog>, so focus stays inside, the page behind is inert, Esc closes, and focus
     goes back to the trigger (or whatever held it before). Phone (< 1024 px, or `variant="sheet"`): a bottom
     sheet on --sheet, radius 28 on top, a grab bar; it rises in 280 ms on the sheet curve and falls in 200 ms,
     its drag follows the finger and dismisses past 30 % of its height or on a fast flick. Desktop (or
     `variant="modal"`): a centred modal on --modal (or --pop with `tone="pop"`), radius 28, fading and scaling
     from 0.98 in 180 ms. The scrim is black at 60 %. Reduced motion: no travel or scale, opacity only. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/i18n';
  import { reducedMotion } from '$lib/motion';
  import Icon from './Icon.svelte';

  interface Props {
    open: boolean;
    /** The dialog's name: its visible heading, or only its accessible name with `hideTitle`. */
    title: string;
    hideTitle?: boolean;
    onclose: () => void;
    /** Focus goes back here on close (else to the element focused when it opened). */
    trigger?: HTMLElement | null;
    /** `auto`: a bottom sheet below 1024 px, a modal above. */
    variant?: 'auto' | 'sheet' | 'modal';
    /** Desktop modal width (px), at most the viewport minus 32. */
    width?: number;
    /** Phone: a full-height sheet from 56 px under the top (the room sheet). */
    tall?: boolean;
    /** Surface of the desktop modal: `modal` (the room sheet) or `pop` (dialogs, the Absence sheet). */
    tone?: 'modal' | 'pop';
    /** No × button in the header (a sheet whose actions close it, or an action sheet with « Annuler »). */
    noClose?: boolean;
    /** Replaces the default header (title + ×); the dialog stays named by `title`. */
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;
    class?: string;
  }
  let {
    open, title, hideTitle = false, onclose, trigger = null, variant = 'auto', width = 460, tall = false, tone = 'pop',
    noClose = false, header, footer, children, class: cls = ''
  }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let returnTo: HTMLElement | null = null;
  // Drag to dismiss (phone sheet): the offset follows the finger, no easing.
  let drag = $state(0);
  let dragging = $state(false);
  let start = { y: 0, t: 0 };

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo = trigger ?? (document.activeElement as HTMLElement | null);
      drag = 0;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close?.();
  });

  function closed() {
    dragging = false;
    if (open) onclose();
    const to = trigger ?? returnTo;
    if (to?.isConnected) to.focus();
    returnTo = null;
  }

  const isSheet = () => variant === 'sheet' || (variant === 'auto' && !matchMedia('(min-width: 1024px)').matches);

  function down(e: PointerEvent) {
    if (!isSheet() || e.button !== 0) return;
    dragging = true;
    start = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    drag = Math.max(0, e.clientY - start.y);
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const h = dialog?.getBoundingClientRect().height ?? 1;
    const dy = Math.max(0, e.clientY - start.y);
    const v = dy / Math.max(1, performance.now() - start.t);
    if (dy > h * 0.3 || (v > 0.6 && dy > 24)) {
      if (reducedMotion()) drag = 0;
      dialog?.close?.();
    } else drag = 0;
  }
</script>

<dialog bind:this={dialog} class="sheet {variant} tone-{tone} {cls}" class:tall class:dragging aria-labelledby="{uid}-title"
  style:--w="{width}px" style:--drag="{drag}px" onclose={closed} oncancel={() => (drag = 0)}
  onclick={(e) => e.target === dialog && dialog?.close?.()}>
  <!-- Only the backdrop closes: a tap anywhere in the sheet (its padding too) lands on .body. -->
  {#if open}<div class="body">
    <div class="grab-zone" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} aria-hidden="true">
      <span class="grab"></span>
    </div>
    {#if header}
      <h2 id="{uid}-title" class="visually-hidden">{title}</h2>
      {@render header()}
    {:else}
      <div class="head" class:hidden-title={hideTitle}>
        <h2 id="{uid}-title" class:visually-hidden={hideTitle}>{title}</h2>
        {#if !noClose}<button type="button" class="btn btn-icon" aria-label={m.common.close} onclick={() => dialog?.close?.()}><Icon
              name="x" size={18} /></button>{/if}
      </div>
    {/if}
    <div class="content scroll-quiet">{@render children()}</div>
    {#if footer}<div class="foot">{@render footer()}</div>{/if}
  </div>{/if}
</dialog>

<style>
  dialog {
    width: min(var(--w), calc(100vw - 32px));
    max-width: none;
    max-height: calc(100dvh - 48px);
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: var(--r-sheet);
    background: var(--pop);
    color: var(--tx);
    box-shadow: var(--shadow-pop);
    opacity: 0;
    transform: scale(0.98);
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog.tone-modal {
    background: var(--modal);
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: var(--t-modal);
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: scale(0.98);
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
  .body {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    padding: 22px 24px 24px;
  }
  .grab-zone {
    display: none;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 -4px 12px 0;
  }
  .head.hidden-title {
    justify-content: flex-end;
    margin-bottom: 4px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  .content {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    /* Room for focus rings at the edges of a scrolling region. */
    margin: 0 -4px;
    padding: 0 4px 2px;
  }
  .foot {
    padding-top: 16px;
  }

  /* The phone bottom sheet. */
  @media (max-width: 1023px) {
    dialog.auto,
    dialog.sheet {
      width: 100%;
      max-height: calc(100dvh - 56px);
      margin: auto 0 0;
      border-radius: var(--r-sheet) var(--r-sheet) 0 0;
      background: var(--sheet);
      box-shadow: none;
      opacity: 1;
      transform: translateY(100%);
      transition:
        transform var(--t-sheet-out) var(--ease-in),
        overlay var(--t-sheet-out) allow-discrete,
        display var(--t-sheet-out) allow-discrete;
    }
    dialog.auto[open],
    dialog.sheet[open] {
      transform: translateY(var(--drag));
      transition-duration: var(--t-sheet-in);
      transition-timing-function: var(--ease-sheet);
    }
    @starting-style {
      dialog.auto[open],
      dialog.sheet[open] {
        transform: translateY(100%);
      }
    }
    dialog.tall {
      height: calc(100dvh - 56px);
    }
    dialog.dragging[open] {
      transition: none;
    }
    .body {
      padding: 0 18px calc(24px + env(safe-area-inset-bottom));
    }
    .grab-zone {
      display: grid;
      place-items: center;
      height: 28px;
      margin: 0 -18px 4px;
      touch-action: none;
      cursor: grab;
    }
    .grab {
      width: 40px;
      height: 5px;
      border-radius: 3px;
      background: var(--field);
    }
    h2 {
      font-size: 17px;
    }
  }
  @media (min-width: 1024px) {
    dialog.sheet {
      margin: auto auto 0;
      border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open],
    dialog.auto,
    dialog.sheet {
      transform: none !important;
      transition-property: opacity, overlay, display;
    }
  }
</style>
