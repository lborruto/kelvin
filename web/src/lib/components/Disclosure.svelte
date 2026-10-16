<!-- L2 of « data on demand » (direction-2 §1.2, DESIGN « Disclosure »): a button row that opens a region.
     The heading (when given) holds the button, never the other way round. Closed, the region is
     `hidden="until-found"`: find-in-page still reaches it and opens it (`beforematch`). It slides by its
     grid row (0fr → 1fr) over dur(T.enter); reduced motion: instant. `detail` opens it at first render
     when « Afficher les détails techniques » is on. Variants: `row` (a 44 px row, 13 px 600 ink, a chevron
     turning 90°, an optional muted meta on the right) and `inline` (a dotted 13 px muted text button with
     the help glyph, inside a sentence line: its region takes the next line of a wrapping flex parent). -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { dur, T } from '$lib/motion';
  import { detail as pref } from '$lib/stores/detail.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** Right-aligned muted words on the row (« 3 lignes », « 2 estimations »). */
    meta?: string | null;
    /** Wrap the button in this heading (the heading holds the button). */
    heading?: 'h2' | 'h3' | 'h4' | null;
    /** Open at first render when the « détails techniques » preference is on. */
    detail?: boolean;
    open?: boolean;
    variant?: 'row' | 'inline';
    /** Id of the region (an anchor may target it); generated otherwise. */
    id?: string;
    /** Id of the button (a section may be labelled by it). */
    buttonId?: string;
    class?: string;
    /** Called after each change by the user or by find-in-page. */
    ontoggle?: (open: boolean) => void;
    children: Snippet;
  }
  let {
    title, meta = null, heading = null, detail = false, open = $bindable(false), variant = 'row', id, buttonId, class: cls = '',
    ontoggle, children
  }: Props = $props();
  const uid = $props.id();
  let regionId = $derived(id ?? `${uid}-region`);

  // The preference opens a `detail` disclosure once, before first paint; afterwards it is the user's.
  untrack(() => {
    if (detail && pref.on) open = true;
  });

  /** The region is laid out (no `hidden`) and expanded (1fr): two steps, so the slide can play both ways. */
  let laidOut = $state(open);
  let expanded = $state(open);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const o = open;
    clearTimeout(timer);
    const d = dur(T.enter);
    if (o) {
      laidOut = true;
      if (d === 0 || typeof requestAnimationFrame !== 'function') expanded = true;
      else requestAnimationFrame(() => requestAnimationFrame(() => (expanded = open)));
    } else {
      expanded = false;
      if (d === 0) laidOut = false;
      else timer = setTimeout(() => (laidOut = open), d);
    }
    return () => clearTimeout(timer);
  });

  function toggle() {
    open = !open;
    ontoggle?.(open);
  }
  function found() {
    if (open) return;
    open = true;
    ontoggle?.(true);
  }
</script>

{#snippet button()}
  <button type="button" id={buttonId} class="dbtn" aria-expanded={open} aria-controls={regionId} onclick={toggle}>
    {#if variant === 'row'}
      <span class="chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
    {:else}
      <Icon name="help" size={14} />
    {/if}
    <span class="dtitle">{title}</span>
    {#if meta}<span class="meta">{meta}</span>{/if}
  </button>
{/snippet}

<div class="disclosure {variant} {cls}" class:open>
  {#if heading}
    <svelte:element this={heading} class="dhead">{@render button()}</svelte:element>
  {:else}
    {@render button()}
  {/if}
  <div id={regionId} class="region" class:expanded hidden={laidOut ? undefined : 'until-found'} onbeforematch={found}>
    <div class="inner">{@render children()}</div>
  </div>
</div>

<style>
  .disclosure.inline {
    display: contents;
  }
  .dhead {
    margin: 0;
  }
  /* Under a heading the button takes the heading's type (a panel's section label stays one). */
  .dhead .dbtn {
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
  }
  .dbtn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: inherit;
    text-transform: inherit;
    line-height: 16px;
    text-align: left;
    cursor: pointer;
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--mu);
    transition: transform var(--t-enter) var(--ease-out);
  }
  .open .chev {
    transform: rotate(90deg);
  }
  .dtitle {
    min-width: 0;
  }
  .meta {
    margin-left: auto;
    padding-left: 12px;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--mu);
    white-space: nowrap;
  }
  /* Inline: a dotted text button in a sentence line (Programme « Comment modifier ? »). */
  .inline .dbtn {
    display: inline-flex;
    width: auto;
    color: var(--mu);
    font-weight: 400;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  @media (hover: hover) {
    .inline .dbtn:hover {
      color: var(--tx);
    }
  }
  .region {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--t-enter) var(--ease-out);
  }
  .region.expanded {
    grid-template-rows: 1fr;
  }
  .inline .region {
    flex-basis: 100%;
  }
  .inner {
    min-height: 0;
    overflow: hidden;
  }
  @media (prefers-reduced-motion: reduce) {
    .chev,
    .region {
      transition: none;
    }
  }
</style>
