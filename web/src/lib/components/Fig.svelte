<!-- An exact-value trigger (direction-2 §1.2 « .fig »): a figure that has more precision or provenance than
     it shows is a button that looks like its text with a dotted underline, named « {value}, détails ».
     Mouse: the Fiche opens after 120 ms of hover and closes 200 ms after the pointer leaves both figure and
     card. Click, tap or Enter pins it (Esc, the close button or a press elsewhere closes it, focus back on
     the figure). Phone (< 1024 px): a tap opens the bottom sheet. See foundation-api.md. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import type { Provenance } from '$lib/provenance';
  import Fiche from './Fiche.svelte';
  import type { FicheAction, FicheRow } from './FicheBody.svelte';

  interface Props {
    /** The figure as shown (L0): the visible text unless `children` draws it, and the start of its name. */
    value: string;
    /** The accessible name's lead when it differs from `value` (« 91,00 €, estimation »). */
    label?: string;
    /** The Fiche's title (« Octobre 2026, du 1er au 14 »). */
    title: string;
    rows?: FicheRow[];
    empty?: string | null;
    notes?: string[];
    provenance?: Provenance | null;
    action?: FicheAction | null;
    /** Extra classes on the button (the host's text style). */
    class?: string;
    /** Draws the figure (a value with its unit in smaller type, a tag…); defaults to `value`. */
    children?: Snippet;
    /** Hover delays (tests and charts may tune them). */
    openDelay?: number;
    closeDelay?: number;
  }
  let {
    value, label, title, rows = [], empty = null, notes = [], provenance = null, action = null, class: cls = '',
    children, openDelay = 120, closeDelay = 200
  }: Props = $props();
  const uid = $props.id();

  let btn = $state<HTMLButtonElement>();
  let open = $state(false);
  let pinned = $state(false);
  let byKeyboard = $state(false);
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function clear() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  }
  $effect(() => () => clear());

  function hoverIn(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || !desktop.matches) return;
    clearTimeout(closeTimer);
    if (!open) openTimer = setTimeout(() => (open = true), openDelay);
  }
  function hoverOut() {
    clearTimeout(openTimer);
    if (open && !pinned) closeTimer = setTimeout(close, closeDelay);
  }
  function close() {
    clear();
    open = false;
    pinned = false;
    byKeyboard = false;
  }
  function onclick(e: MouseEvent) {
    clear();
    if (open && pinned) return close();
    byKeyboard = e.detail === 0;
    open = true;
    pinned = true;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  }
</script>

<button
  bind:this={btn}
  type="button"
  class="fig {cls}"
  aria-label={m.fig.details(label ?? value)}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-controls={open ? `${uid}-fiche` : undefined}
  {onclick}
  {onkeydown}
  onpointerenter={hoverIn}
  onpointerleave={hoverOut}>{#if children}{@render children()}{:else}{value}{/if}</button>
<Fiche
  id="{uid}-fiche"
  {open}
  {pinned}
  anchor={btn}
  {title}
  {rows}
  {empty}
  {notes}
  {provenance}
  {action}
  focusOnOpen={byKeyboard}
  onclose={close}
  onenter={() => clearTimeout(closeTimer)}
  onleave={hoverOut} />
