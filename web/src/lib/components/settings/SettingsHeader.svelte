<!-- A Réglages page header (Tableau §4 « Réglages », mockups section 5): on a sub-page « ‹ Réglages » above
     the title; the title is the page h1 (`.t-page`: 32 phone / 30 desktop); one muted line under it (a plain
     state, or a SourceLine-like snippet) that holds its height from the first paint; actions on the right. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import Icon from '../Icon.svelte';

  interface Props {
    title: string;
    /** A sub-page: the way back to the overview first. */
    back?: boolean;
    /** The one-line state under the title (null keeps the line's height: a skeleton). */
    state?: string | null;
    /** Replaces the plain state line. */
    stateLine?: Snippet;
    actions?: Snippet;
    /** `home-<section>`: the title travels from the overview card (view transition). */
    vt?: string;
    /** No state line at all (Compte). */
    bare?: boolean;
  }
  let { title, back = false, state = null, stateLine, actions, vt, bare = false }: Props = $props();
</script>

<header class="sh">
  {#if back}<a class="back" href={ROUTES.home}><Icon name="chevron-left" size={18} />{m.nav.home}</a>{/if}
  <div class="row">
    <h1 class="t-page" style:view-transition-name={vt}>{title}</h1>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
  {#if stateLine}<div class="state">{@render stateLine()}</div>
  {:else if !bare}<p class="state">{#if state !== null}{state}{:else}<span class="skeleton sk-line" aria-hidden="true"></span>{/if}</p>{/if}
</header>

<style>
  .sh {
    display: grid;
    gap: 4px;
    margin-bottom: 20px;
    min-width: 0;
  }
  .back {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    justify-self: start;
    min-height: 32px;
    margin: -6px 0 0 -4px;
    color: var(--mu);
    font-size: 15px;
    text-decoration: none;
  }
  .back::before {
    content: '';
    position: absolute;
    inset: -6px 0;
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
    min-width: 0;
  }
  h1 {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 8px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    min-height: 21px;
    margin: 0;
    color: var(--mu);
    font-size: 15px;
    line-height: 21px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p.state {
    display: block;
  }
  .state .skeleton {
    display: inline-block;
    width: 12rem;
    height: 14px;
  }
  @media (max-width: 1023px) {
    .sh {
      margin-bottom: 14px;
    }
    .state {
      font-size: 13.5px;
    }
  }
</style>
