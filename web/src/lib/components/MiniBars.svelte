<!-- A mini bar chart (spec §3 « BillWidget », « Hier », the Résumé's 7-day bars): one bar per value, HC hatched
     at the base and HP above when `parts` are given (the tariff blues), else one series (`home` or the
     radiator-only grey). A missing value is a faint 3 px stub, never a zero bar. `estimate` draws a dashed
     outline to that height on the last bar (the month's end ≈). `highlight` keeps one bar full and dims the
     rest. Tempo dots under the bars only when `tempo` is given (Tempo in force). Behind it, a visually hidden
     table (`rows`) or, without rows, the image's name (`label`). Fills the width it is given. -->
<script lang="ts">
  import type { TempoColour } from '$lib/api/types';
  import { seriesBackground } from '$lib/energy';
  import TempoDot from './TempoDot.svelte';

  interface Props {
    values: (number | null)[];
    /** Per bar: the off-peak and peak parts (summing to the value). */
    parts?: ({ hc: number | null; hp: number | null } | null)[] | null;
    series?: 'home' | 'radiators';
    max?: number | null;
    height?: number;
    gap?: number;
    highlight?: number | null;
    /** The last bar's expected total (dashed outline). */
    estimate?: number | null;
    tempo?: (TempoColour | null)[] | null;
    label: string;
    rows?: { label: string; value: string }[] | null;
  }
  let { values, parts = null, series = 'home', max = null, height = 46, gap = 2, highlight = null, estimate = null, tempo = null, label, rows = null }: Props =
    $props();
  let top = $derived(max ?? Math.max(1e-9, ...values.map((v) => v ?? 0), estimate ?? 0));
  const h = (v: number | null | undefined) => (v == null ? 0 : Math.max(0, (v / top) * 100));
</script>

<div class="mini">
  <div class="bars" style:height="{height}px" style:gap="{gap}px" role={rows ? undefined : 'img'} aria-label={rows ? undefined : label}
    aria-hidden={rows ? 'true' : undefined}>
    {#each values as v, i (i)}
      {@const p = parts?.[i]}
      <span class="col" class:dim={highlight != null && highlight !== i}>
        {#if i === values.length - 1 && estimate != null}<span class="est" style:height="{h(estimate)}%"></span>{/if}
        {#if v == null}<span class="stub"></span>
        {:else if p && p.hc != null && p.hp != null}
          <span class="seg hp" style:height="{h(p.hp)}%" style:background="var(--hp)"></span>
          <span class="seg hc" style:height="{h(p.hc)}%" style:background={seriesBackground('hc')}></span>
        {:else}<span class="seg one" style:height="{h(v)}%" style:background={seriesBackground(series)}></span>{/if}
      </span>
    {/each}
  </div>
  {#if tempo}
    <div class="dots" style:gap="{gap}px" aria-hidden="true">{#each values as _, i (i)}<span><TempoDot colour={tempo[i] ?? null} /></span>{/each}</div>
  {/if}
  {#if rows}
    <div class="visually-hidden">
      <table><caption>{label}</caption><tbody>{#each rows as r (r.label)}<tr><th scope="row">{r.label}</th><td>{r.value}</td></tr>{/each}</tbody></table>
    </div>
  {/if}
</div>

<style>
  .mini {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .bars {
    display: flex;
    align-items: flex-end;
  }
  .col {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-end;
    min-width: 2px;
    height: 100%;
    transition: opacity var(--t-state) ease;
  }
  .col.dim {
    opacity: 0.45;
  }
  .seg {
    display: block;
    width: 100%;
    min-height: 1px;
  }
  .seg.hp,
  .seg.one {
    border-radius: 2px 2px 0 0;
  }
  /* A 1 px knockout between HP and the HC base. */
  .seg.hp + .seg.hc {
    box-shadow: inset 0 1px 0 var(--s1);
  }
  .stub {
    display: block;
    height: 3px;
    border-radius: 1.5px;
    background: var(--s2);
  }
  .est {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border: 1px dashed var(--fa-mark);
    border-radius: 2px;
  }
  .dots {
    display: flex;
  }
  .dots span {
    display: grid;
    flex: 1;
    place-items: center;
    min-width: 2px;
  }
</style>
