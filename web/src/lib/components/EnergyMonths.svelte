<!-- Année's « Mois par mois » (spec §4 Énergie): one row per month bar, its kWh and its € as the bar's own inspector
     reads them (`inspectBucket` rows, so the table, the bar card and the CSV say the same figure). A running month
     says up to which day it is counted. A row opens that month (the bar's drill). Two columns from 640 px. -->
<script lang="ts">
  import type { Inspection } from '$lib/inspector';
  import { fmtDay, monthName } from '$lib/format';
  import { m } from '$lib/i18n';

  interface Props {
    /** Month keys (« 2026-10 »), in order. */
    keys: string[];
    details: Inspection[];
    /** The last day with data: the month holding it, when not over, says « au 15/10 ». */
    last: string | null;
    onopen?: (i: number) => void;
    class?: string;
  }
  let { keys, details, last, onopen, class: cls = '' }: Props = $props();
  const uid = $props.id();

  const value = (ins: Inspection | undefined, key: string) => ins?.rows.find((r) => r.key === key) ?? null;
  // Newest month first on a phone would reorder the bars; the table keeps their order.
  let rows = $derived(
    keys.map((k, i) => {
      const home = value(details[i], 'home');
      const cost = value(details[i], 'cost');
      const running = !!last && last.slice(0, 7) === k && Number(last.slice(8, 10)) < new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0)).getUTCDate();
      return { key: k, name: monthName(`${k}-01`), kwh: home?.value ?? '—', eur: cost?.value ?? null, est: !!cost?.est, until: running && last ? fmtDay(last) : null };
    })
  );
</script>

<section class="panel months {cls}" aria-labelledby="{uid}-t">
  <h3 id="{uid}-t">{m.energyBoard.monthsTitle}</h3>
  <ul style:--rows={Math.ceil(rows.length / 2)}>
    {#each rows as r, i (r.key)}
      <li>
        <button type="button" class="row" onclick={() => onopen?.(i)}>
          <span class="n">{r.name}{#if r.until}<span class="until">{' '}{m.energyBoard.monthUntil(r.until)}</span>{/if}</span>
          <span class="kwh num">{r.kwh}</span>
          {#if r.eur != null}<span class="eur num">{r.eur}{#if r.est}{' '}<span class="est">{m.fiche.est}</span>{/if}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .months {
    container-type: inline-size;
  }
  h3 {
    margin: 0 0 6px;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    column-gap: 40px;
  }
  @container (min-width: 640px) {
    ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-flow: column;
      grid-template-rows: repeat(var(--rows, 6), auto);
    }
  }
  li {
    border-top: 1px solid var(--line);
    min-width: 0;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 7rem;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  @media (hover: hover) {
    .row:hover .n {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .n {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .until,
  .kwh {
    color: var(--mu);
  }
  .until {
    font-size: 12px;
  }
  .eur {
    justify-self: end;
    font-weight: 600;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 400;
    color: var(--mu);
  }
</style>
