<!-- A Réglages section card (Tableau §4 « Réglages », mockups 5 « Vue d’ensemble »): a 34–36 px glyph disc, the
     title (16/600) and a chevron; the section's state in one line (14) and its detail in muted lines (13); its
     SourceLine or band at the bottom. The whole card is a link to its sub-page (a stretched ::after on the title
     link). A fixed min-height (150 px), so the grid never re-flows when the summaries arrive: before them, a
     skeleton line holds the place. In the list form (the overview below 720 px of container), the card is a
     64 px grouped-list row: disc, title over the one-line summary, chevron (iPhone Réglages density). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    href: string;
    title: string;
    /** The one-line state (L0): the list row's second line and the link's name after the title. Null: loading. */
    summary: string | null;
    icon?: IconName;
    /** `home-<section>`: the title travels into the sub-page h1 (view transition). */
    vt?: string;
    /** Further lines of the card form (hidden in the list form). */
    children?: Snippet;
    /** The SourceLine (or the tariff band) at the bottom of the card form. */
    foot?: Snippet;
  }
  let { href, title, summary, icon, vt, children, foot }: Props = $props();
</script>

<article class="hcard">
  <div class="top">
    {#if icon}<span class="disc" aria-hidden="true"><Icon name={icon} size={18} /></span>{/if}
    <h3><a {href} aria-label={summary ? `${title}, ${summary}` : title} style:view-transition-name={vt}>{title}</a></h3>
    <span class="chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
  </div>
  {#if summary === null}
    <p class="sum"><span class="skeleton sk-line" aria-hidden="true"></span></p>
  {:else}
    <p class="sum"><span class="txt">{summary}</span></p>
    {#if children}<div class="more">{@render children()}</div>{/if}
    {#if foot}<div class="foot">{@render foot()}</div>{/if}
  {/if}
</article>

<style>
  .hcard {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 150px;
    padding: 18px 20px;
    border-radius: var(--r-widget);
    background: var(--s1);
    min-width: 0;
    transition: background-color var(--t-state) ease;
  }
  @media (hover: hover) {
    .hcard:hover {
      background: color-mix(in srgb, var(--s1) 70%, var(--s2));
    }
  }
  .hcard:active {
    background: var(--s2);
  }
  .hcard:has(h3 a:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .disc {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--tx);
  }
  h3 {
    flex: 1;
    margin: 0;
    min-width: 0;
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
  }
  h3 a {
    color: var(--tx);
    text-decoration: none;
    outline: none;
  }
  /* The whole card is the link. */
  h3 a::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .chev {
    display: inline-flex;
    flex: none;
    color: var(--mu);
  }
  .sum,
  .more,
  .foot {
    margin: 0;
    min-width: 0;
  }
  .sum {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 14px;
    line-height: 20px;
    min-height: 20px;
  }
  .sum .skeleton {
    display: block;
    width: 12rem;
    max-width: 100%;
    height: 13px;
  }
  .txt {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .more {
    display: grid;
    gap: 4px;
    font-size: 13px;
    line-height: 18px;
    color: var(--mu);
  }
  /* Above the stretched link: the SourceLine opens its own Fiche. */
  .foot {
    position: relative;
    z-index: 1;
    align-self: stretch;
    max-width: 100%;
    margin-top: auto;
    padding-top: 6px;
  }

  /* The list form (the overview's cards container below 720 px): 64 px rows, one summary line. */
  @container home-cards (max-width: 719px) {
    .hcard {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      align-content: center;
      column-gap: 12px;
      row-gap: 0;
      min-height: 64px;
      height: 64px;
      padding: 0;
      border-radius: 0;
      background: none;
    }
    .hcard:hover {
      background: none;
    }
    .top {
      display: contents;
    }
    .disc {
      grid-row: 1 / 3;
      width: 34px;
      height: 34px;
    }
    h3 {
      grid-column: 2;
      font-size: 15px;
      line-height: 20px;
    }
    .chev {
      grid-row: 1 / 3;
      grid-column: 3;
      align-self: center;
    }
    .sum {
      grid-column: 2;
      margin: 0;
      color: var(--mu);
      font-size: 13px;
      line-height: 18px;
      min-height: 18px;
    }
    .txt {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .more,
    .foot {
      display: none;
    }
  }
</style>
