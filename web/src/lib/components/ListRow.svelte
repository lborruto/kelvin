<!-- A grouped-list row (spec §3, `.li`): ≥ 52 px, an optional 34 px glyph disc or bare glyph, the label (with a
     muted second line), a value or any trailing content, and a chevron when it leads somewhere. A link
     (`href`), a button (`onclick`, `expanded` for a disclosure row) or plain facts. `danger` writes the label in
     bad (« Déconnecter les autres appareils »). Must sit directly in a GroupedList / `.grp`. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    label: string;
    sub?: string;
    value?: string;
    icon?: IconName;
    /** The glyph in a 34 px s2 disc (Réglages overview) rather than bare. */
    disc?: boolean;
    iconTone?: 'heat' | 'muted' | 'faint' | null;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    /** A disclosure row: its state. */
    expanded?: boolean;
    controls?: string;
    chevron?: boolean;
    danger?: boolean;
    /** 52 (default) or 64 (a row with a second line). */
    tall?: boolean;
    trailing?: Snippet;
    class?: string;
  }
  let {
    label, sub, value, icon, disc = false, iconTone = 'muted', href, onclick, expanded, controls, chevron, danger = false, tall = false,
    trailing, class: cls = ''
  }: Props = $props();
  let showChevron = $derived(chevron ?? (!!href || (!!onclick && expanded === undefined)));
</script>

{#snippet inner()}
  {#if icon}<span class="ic {iconTone ?? ''}" class:disc aria-hidden="true"><Icon name={icon} size={disc ? 17 : 18} /></span>{/if}
  <span class="x"><span class="lb" class:danger>{label}</span>{#if sub}<span class="sub">{sub}</span>{/if}</span>
  {#if value}<span class="val num">{value}</span>{/if}
  {#if trailing}{@render trailing()}{/if}
  {#if expanded !== undefined}<span class="chev" class:open={expanded} aria-hidden="true"><Icon name="chevron-down" size={16} /></span>
  {:else if showChevron}<span class="chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>{/if}
{/snippet}

{#if href}
  <a class="li row {cls}" class:tall {href}>{@render inner()}</a>
{:else if onclick}
  <button type="button" class="li row {cls}" class:tall {onclick} aria-expanded={expanded} aria-controls={controls}>{@render inner()}</button>
{:else}
  <div class="li {cls}" class:tall>{@render inner()}</div>
{/if}

<style>
  .li {
    width: 100%;
    color: var(--tx);
    font: inherit;
    text-align: left;
    text-decoration: none;
  }
  .li.tall {
    min-height: 64px;
  }
  .row {
    margin: 0;
    padding: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
    background: none;
    cursor: pointer;
  }
  .row:focus-visible {
    outline-offset: -2px;
    border-radius: 8px;
  }
  .ic {
    display: grid;
    place-items: center;
    flex: none;
  }
  .ic.muted {
    color: var(--mu);
  }
  .ic.faint {
    color: var(--fa);
  }
  .ic.heat {
    color: var(--heat);
  }
  .ic.disc {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--tx);
  }
  .x {
    display: grid;
    flex: 1;
    min-width: 0;
    padding: 8px 0;
  }
  .lb {
    overflow-wrap: anywhere;
  }
  .lb.danger {
    color: var(--bad);
  }
  .sub {
    color: var(--mu);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .val {
    flex: none;
    max-width: 55%;
    font-weight: 600;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--mu);
    transition: transform var(--t-enter) var(--ease-out);
  }
  .chev.open {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
