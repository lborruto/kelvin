<!-- One line of source and freshness (direction-2 §1.2, DESIGN « SourceLine »): 12 px muted,
     « [Freshness] Linky · données jusqu’au 14/10 », ellipsised on one line (it never reflows). With a
     Fiche (`title` + rows / provenance) the words are a Fig that opens the source's exact times, quotas
     and next read. -->
<script lang="ts">
  import type { Fresh } from '$lib/freshness';
  import type { Provenance } from '$lib/provenance';
  import Fig from './Fig.svelte';
  import type { FicheAction, FicheRow } from './FicheBody.svelte';
  import Freshness from './Freshness.svelte';

  interface Props {
    /** The source's name: « Linky », « Cozytouch ». */
    source: string;
    /** Its state in words: « données jusqu’au 14/10 », « il y a 1 min ». */
    text: string;
    state: Fresh;
    /** The source's Fiche: without a title the line is plain text. */
    title?: string | null;
    rows?: FicheRow[];
    notes?: string[];
    provenance?: Provenance | null;
    action?: FicheAction | null;
    /** State in bad text (a failure the user must fix): only with `state` « bad ». */
    class?: string;
  }
  let { source, text, state, title = null, rows = [], notes = [], provenance = null, action = null, class: cls = '' }: Props = $props();
  let words = $derived(`${source} · ${text}`);
</script>

<p class="source-line {cls}" class:bad={state === 'bad'}>
  <Freshness {state} />
  {#if title}
    <Fig value={words} {title} {rows} {notes} {provenance} {action} class="trigger"><span class="words">{words}</span></Fig>
  {:else}
    <span class="words">{words}</span>
  {/if}
</p>

<style>
  .source-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--mu);
  }
  .bad {
    color: var(--bad);
  }
  .source-line :global(.words) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The Fig is a block in the flex line; its words ellipsise inside it, so its 44 px hit area is not clipped. */
  .source-line :global(.fig.trigger) {
    display: block;
    min-width: 0;
    max-width: 100%;
  }
  .source-line :global(.fig.trigger .words) {
    display: block;
  }
</style>
