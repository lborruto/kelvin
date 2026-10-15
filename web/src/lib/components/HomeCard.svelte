<!-- A Maison section card (direction-2 §3, DESIGN « HomeCard »): the section's state in two or three lines,
     the whole card a link to its sub-page (a stretched ::after on the title link), the SourceLine on top of
     it. Fixed min-height (132 px), so the grid never re-flows when the summaries arrive: before them, a
     skeleton line holds the place. In the narrow form (the overview's list below 720 px of container), the
     card is a 64 px row: title, the one-line summary, a chevron (iOS-settings density). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    href: string;
    title: string;
    /** The one-line state (L0): the list row's second line and the link's name after the title. Null: loading. */
    summary: string | null;
    /** `home-<section>`: the title travels into the sub-page h1 (view transition). */
    vt?: string;
    /** A mark before the summary (a Freshness ring). */
    mark?: Snippet;
    /** Further lines of the card form (hidden in the list form). */
    children?: Snippet;
    /** The SourceLine at the bottom of the card form. */
    foot?: Snippet;
  }
  let { href, title, summary, vt, mark, children, foot }: Props = $props();
</script>

<article class="hcard">
  <h3><a {href} aria-label={summary ? `${title}, ${summary}` : title} style:view-transition-name={vt}>{title}</a></h3>
  <span class="chev" aria-hidden="true"><Icon name="chevron" size={16} /></span>
  {#if summary === null}
    <p class="sum"><span class="skeleton inset" aria-hidden="true"></span></p>
  {:else}
    <p class="sum">{#if mark}<span class="mark">{@render mark()}</span>{/if}<span class="txt">{summary}</span></p>
    {#if children}<div class="more">{@render children()}</div>{/if}
    {#if foot}<div class="foot">{@render foot()}</div>{/if}
  {/if}
</article>

<style>
  .hcard {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: start;
    gap: 6px 8px;
    min-height: 132px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
    transition:
      border-color var(--t-state) ease,
      background-color var(--t-state) ease;
  }
  @media (hover: hover) {
    .hcard:hover {
      border-color: var(--fa);
    }
  }
  .hcard:active {
    background: var(--s2);
  }
  .hcard:has(h3 a:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    min-width: 0;
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
    color: var(--fa);
    align-self: start;
    padding-top: 2px;
  }
  .sum,
  .more,
  .foot {
    grid-column: 1 / -1;
    margin: 0;
    min-width: 0;
  }
  .sum {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    line-height: 19px;
    min-height: 19px;
  }
  .sum .skeleton {
    display: block;
    width: 12rem;
    max-width: 100%;
    height: 13px;
    border-radius: 4px;
  }
  .mark {
    display: inline-flex;
    flex: none;
  }
  .txt {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .more {
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: var(--mu);
  }
  /* Above the stretched link: the SourceLine opens its own Fiche. */
  .foot {
    position: relative;
    z-index: 1;
    justify-self: start;
    max-width: 100%;
    margin-top: auto;
  }

  /* The list form (the overview's cards container below 720 px): 64 px rows, one summary line. */
  @container home-cards (max-width: 719px) {
    .hcard {
      min-height: 64px;
      height: 64px;
      align-content: center;
      gap: 0 8px;
      padding: 0 14px;
      border: 0;
      border-radius: 0;
      background: none;
    }
    .hcard:hover {
      border-color: transparent;
    }
    .chev {
      grid-row: 1 / 3;
      grid-column: 2;
      align-self: center;
      padding: 0;
    }
    .sum {
      grid-column: 1;
      color: var(--mu);
      font-size: 13px;
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
