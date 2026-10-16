<!-- The one row renderer behind every exact value (DESIGN « Fiche »): a 13 px 600 title, label / value rows
     (muted label left, tabular value right, « dont » rows indented 10 px, « est. » after an estimate, the
     reason under a « — »), the notes, then the Provenance block (Source, Relevé, Nature) under a hairline,
     and one optional action. ChartInspector and Fiche both draw through it, so a chart's card and a
     figure's card read alike. -->
<script lang="ts" module>
  /** A Fiche row. `key` is optional (charts key their rows); `sub` indents a « dont » part. */
  export interface FicheRow {
    key?: string;
    label: string;
    value: string;
    est?: boolean;
    note?: string | null;
    sub?: boolean;
  }
  export interface FicheAction {
    label: string;
    run: () => void;
  }
</script>

<script lang="ts">
  import { m } from '$lib/i18n';
  import { ANCHORS } from '$lib/paths';
  import type { Provenance } from '$lib/provenance';

  interface Props {
    /** Null when the host already shows it (the phone sheet's heading). */
    title?: string | null;
    titleId?: string;
    rows?: FicheRow[];
    /** Said instead of the rows when there is nothing (« Aucune donnée Linky pour ce jour »). */
    empty?: string | null;
    notes?: string[];
    provenance?: Provenance | null;
    /** An estimate links its « est. » to Qualité des données (Énergie only). */
    estLink?: boolean;
    action?: FicheAction | null;
  }
  let { title = null, titleId, rows = [], empty = null, notes = [], provenance = null, estLink = false, action = null }: Props = $props();
  let hasEst = $derived(rows.some((r) => r.est));
</script>

{#if title}<p class="title" id={titleId}>{title}</p>{/if}
{#if empty}<p class="empty">{empty}</p>{/if}
{#if rows.length}
  <dl>
    {#each rows as r, i (r.key ?? i)}
      <div class="row" class:sub={r.sub}>
        <dt>{r.label}</dt>
        <dd class="num">{r.value}{#if r.est}<span class="est">{m.fiche.est}</span>{/if}{#if r.note}<span class="why">{r.note}</span>{/if}</dd>
      </div>
    {/each}
  </dl>
{/if}
{#if notes.length}
  <ul class="notes">{#each notes as n (n)}<li>{n}</li>{/each}</ul>
{/if}
{#if provenance}
  <dl class="prov">
    {#each provenance.rows as r (r.label)}
      <div class="row"><dt>{r.label}</dt><dd>{r.value}</dd></div>
    {/each}
  </dl>
  {#if provenance.notes.length}
    <ul class="notes">{#each provenance.notes as n (n)}<li>{n}</li>{/each}</ul>
  {/if}
{/if}
{#if estLink && hasEst}<p class="foot">{m.chartInspector.estNote} <a href="#{ANCHORS.quality}">{m.chartInspector.quality}</a>.</p>{/if}
{#if action}<button type="button" class="btn btn-sm act" onclick={action.run}>{action.label}</button>{/if}

<style>
  .title {
    margin: 0 0 6px;
    font-weight: 600;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 3px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .row.sub dt {
    padding-left: 10px;
  }
  dt {
    color: var(--mu);
    flex: none;
  }
  dd {
    margin: 0;
    min-width: 0;
    text-align: right;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  /* The Provenance block: where the figure comes from, under a hairline, in 12 px. */
  .prov {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    font-size: 12px;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  /* Why a value reads « — »: under it, muted. */
  .why {
    display: block;
    font-size: 12px;
    color: var(--mu);
  }
  .empty,
  .notes,
  .foot {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--mu);
  }
  /* A 44 px tall target around 12 px text, without moving the lines around it. */
  .foot a {
    padding-block: 14px;
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .act {
    margin-top: 10px;
  }
  /* Clear of the link's target above it. */
  .foot + .act {
    margin-top: 18px;
  }
</style>
