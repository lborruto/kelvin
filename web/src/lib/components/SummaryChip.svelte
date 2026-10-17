<!-- A summary chip (spec §3 « SummaryChip », `.cat`): a 46 px s1 pill with a 30 px s2 disc (glyph), the label
     (14/600) over its value (12.5 muted). Climat / Octobre / Réseau / Absence on Maison. A link (`href`), a
     button (`onclick`), a figure with its Fiche (`fiche`: a Fig styled as the pill, named « Dehors 4,2 °C,
     détails », hover 120 ms / click pins / Enter; Plan 14) or plain. `tone="cool"` (an absence running) colours the glyph and the value; heat only
     for heating. `skeleton` keeps its final size before data. The label and the value are separate strings. -->
<script lang="ts" module>
  import type { Provenance } from '$lib/provenance';
  import type { FicheLink, FicheRow } from './FicheBody.svelte';

  /** The exact values behind a chip (L1): the Fig's Fiche. */
  export interface ChipFiche {
    title: string;
    rows: FicheRow[];
    notes?: string[];
    provenance?: Provenance | null;
    link?: FicheLink | null;
  }
</script>

<script lang="ts">
  import Fig from './Fig.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    icon: IconName;
    label: string;
    value?: string;
    tone?: 'cool' | 'heat' | null;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    /** The accessible name when the visible words are not enough. */
    ariaLabel?: string;
    skeleton?: boolean;
    /** The skeleton's width (px). */
    width?: number;
    /** A Fiche behind the chip (the outdoor temperature): the chip becomes its Fig. */
    fiche?: ChipFiche | null;
  }
  let { icon, label, value = '', tone = null, href, onclick, ariaLabel, skeleton = false, width = 150, fiche = null }: Props = $props();
</script>

{#snippet inner()}
  <span class="ci {tone ?? ''}" aria-hidden="true"><Icon name={icon} size={16} /></span>
  <span class="tx"><b>{label}</b><span class="v {tone ?? ''}">{value}</span></span>
{/snippet}

{#if skeleton}
  <span class="skeleton sk-pill" style:width="{width}px" style:height="46px" aria-hidden="true"></span>
{:else if fiche}
  <Fig {value} label={`${label} ${value}`} title={fiche.title} rows={fiche.rows} notes={fiche.notes ?? []} provenance={fiche.provenance ?? null}
    link={fiche.link ?? null} class="cat">{@render inner()}</Fig>
{:else if href}
  <a class="cat" {href} aria-label={ariaLabel}>{@render inner()}</a>
{:else if onclick}
  <button type="button" class="cat" {onclick} aria-label={ariaLabel}>{@render inner()}</button>
{:else}
  <span class="cat" role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>{@render inner()}</span>
{/if}

<style>
  .skeleton {
    display: inline-block;
    flex: none;
  }
  .cat {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex: none;
    height: 46px;
    max-width: 100%;
    padding: 0 14px 0 8px;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--tx);
    font: inherit;
    text-align: left;
    text-decoration: none;
    white-space: nowrap;
  }
  a.cat,
  button.cat {
    cursor: pointer;
    transition: background-color var(--t-state) ease;
  }
  @media (hover: hover) {
    a.cat:hover,
    button.cat:hover {
      background: var(--s2);
    }
  }
  /* The Fig as a pill (`fiche`): the button is Fig's, so the pill's rules reach it globally; no dotted
     underline (the pill's own hover says it opens). */
  :global(button.fig.cat) {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex: none;
    height: 46px;
    max-width: 100%;
    padding: 0 14px 0 8px;
    border-radius: var(--r-pill);
    background: var(--s1);
    color: var(--tx);
    text-align: left;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--t-state) ease;
  }
  @media (hover: hover) {
    :global(button.fig.cat:hover) {
      background: var(--s2);
    }
  }
  :global(button.fig.cat[aria-expanded='true']) {
    background: var(--s2);
  }
  .ci {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--s2);
  }
  .ci.cool {
    color: var(--cool);
  }
  .ci.heat {
    background: var(--heat);
    color: var(--heat-ink);
  }
  .tx {
    display: grid;
    min-width: 0;
  }
  b {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.1;
  }
  .v {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--mu);
    font-size: var(--fs-label);
    line-height: 1.25;
  }
  .v.cool {
    color: var(--cool);
  }
</style>
