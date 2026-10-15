<!--
  A room whose radiators are all offline (switched off at the mains, out of range): a calm notice,
  never red (DESIGN: State Red). The last reading lives here only, labelled with its time.
-->
<script lang="ts">
  import { m } from '$lib/i18n';
  import Icon from './Icon.svelte';

  interface Props {
    /** « Radiateur hors tension ou hors de portée ». */
    hint: string;
    /** How many radiators: the body's « il » / « ils ». */
    count: number;
    /** « Dernière mesure : 23,6 °C à 14:31 »; null when Kelvin does not know when (the line is omitted). */
    last: string | null;
  }
  let { hint, count, last }: Props = $props();
</script>

<div class="notice" role="status">
  <span class="glyph" aria-hidden="true"><Icon name="plug-off" size={18} /></span>
  <p class="hint">{hint}</p>
  <p class="body">{count > 1 ? m.room.offlineBodyMany : m.room.offlineBody}</p>
  {#if last}<p class="last num">{last}</p>{/if}
</div>

<style>
  .notice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--s2) 60%, var(--s1));
  }
  .glyph {
    grid-row: 1 / span 3;
    display: inline-flex;
    padding-top: 1px;
    color: var(--mu);
  }
  p {
    grid-column: 2;
    margin: 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .hint {
    font-size: 14px;
    font-weight: 600;
  }
  .body {
    color: var(--mu);
  }
  .last {
    margin-top: 4px;
  }
</style>
