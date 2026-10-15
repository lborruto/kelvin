<!-- A route's header (direction-2 §1.2, DESIGN « PageHeader »): the h1 (22/700), one muted 13 px state line
     (one line, ellipsised: it never reflows) and right-aligned actions. Desktop: one row; phone: the h1 row
     with its (icon) actions, then the state line. A sub-page puts its back link above the h1 (`back`). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** « Tout va bien », « 2 alertes · Absence jusqu’à dim. 18:00 »; omitted when the page has none. */
    state?: string | null;
    /** A sub-page's way back (« ‹ Maison »), first in the DOM. */
    back?: { href: string; label: string } | null;
    /** Right-aligned actions (buttons, a Menu). */
    actions?: Snippet;
    /** Replaces the plain state line (a SourceLine, a line with marks). */
    stateLine?: Snippet;
  }
  let { title, state = null, back = null, actions, stateLine }: Props = $props();
</script>

<header class="page-header">
  {#if back}<a class="back" href={back.href}><Icon name="chevron-left" size={16} />{back.label}</a>{/if}
  <div class="row">
    <h1>{title}</h1>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if stateLine}<div class="state">{@render stateLine()}</div>
  {:else if state}<p class="state">{state}</p>{/if}
</header>

<style>
  .page-header {
    display: grid;
    gap: 2px;
    margin-bottom: 14px;
    min-width: 0;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    justify-self: start;
    min-height: 44px;
    margin: -8px 0 -4px;
    color: var(--mu);
    font-size: 13px;
    text-decoration: none;
  }
  @media (hover: hover) {
    .back:hover {
      color: var(--tx);
    }
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    min-width: 0;
  }
  h1 {
    margin: 0;
    min-width: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
  }
  .state {
    margin: 0;
    min-width: 0;
    font-size: 13px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
