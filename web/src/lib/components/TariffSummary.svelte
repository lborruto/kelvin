<!-- « Tarif en vigueur » (Tableau §4 « Tarif », DESIGN « TariffSummary »): the tariff read as a fact,
     without one input on screen. Label / value rows (13 px muted label, tabular value): option, subscribed
     power, subscription, the prices (Base: one; HC/HP: two with their swatches; Tempo: a 3 × 2 grid, the
     TempoDot for the colour and the swatch for the hour), then the off-peak hours on the tariff band (TariffBand) with
     the times written beside it (one band per season). Rows whose value just changed pulse once (`changed`). -->
<script lang="ts">
  import type { HcVariant, Tariff, TempoColour } from '$lib/api/types';
  import { fmtAmount, fmtEurExact, fmtPrice } from '$lib/format';
  import { locale, m } from '$lib/i18n';
  import { inForce, slotsText } from '$lib/tariff';
  import { dayBlocks } from '$lib/maintenant';
  import TariffBand from './TariffBand.svelte';
  import Swatch from './Swatch.svelte';
  import TempoDot from './TempoDot.svelte';

  interface Props {
    tariff: Tariff;
    /** Paris today (YYYY-MM-DD): what is in force. */
    today: string;
    /** Row keys to pulse once (after a save). */
    changed?: Set<string>;
  }
  let { tariff, today, changed = new Set() }: Props = $props();

  let row = $derived(inForce(tariff.prices, today));
  let sched = $derived(inForce(tariff.hc_schedules, today));
  const COLOURS: TempoColour[] = ['blue', 'white', 'red'];
  const month = (mo: number) =>
    new Intl.DateTimeFormat(locale.intl, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mo - 1, 15)));
  const months = (v: HcVariant) => (v.months.length === 12 ? m.tariff.allYear : v.months.map(month).join(', '));
  let seasons = $derived(
    row?.option === 'hchp' && sched
      ? sched.variants.map((v) => ({ label: sched.variants.length > 1 ? months(v) : null, slots: v.slots }))
      : row?.option === 'tempo'
        ? [{ label: null, slots: [{ start: tariff.tempo_hours.hc_start, end: tariff.tempo_hours.hc_end }] }]
        : []
  );
</script>

{#if row}
  <dl class="sum">
    <div class="r" class:pulse={changed.has('option')}><dt>{m.tariffSummary.option}</dt><dd>{m.tariffSummary.options[row.option]}</dd></div>
    <div class="r" class:pulse={changed.has('kva')}><dt>{m.tariff.kva}</dt><dd class="num">{m.tariff.kvaValue(tariff.kva)}</dd></div>
    <div class="r" class:pulse={changed.has('sub')}><dt>{m.tariffSummary.subscription}</dt><dd class="num">{m.tariffSummary.perMonth(fmtEurExact(row.subscription_eur_month))}</dd></div>
    {#if row.option === 'base'}
      <div class="r" class:pulse={changed.has('base')}><dt>{m.tariffSummary.base}</dt><dd class="num">{fmtPrice(row.rates.base)}</dd></div>
    {:else if row.option === 'hchp'}
      <div class="r" class:pulse={changed.has('hc')}><dt><Swatch series="hc" size={10} />{m.tariffSummary.hc}</dt><dd class="num">{fmtPrice(row.rates.hc)}</dd></div>
      <div class="r" class:pulse={changed.has('hp')}><dt><Swatch series="hp" size={10} />{m.tariffSummary.hp}</dt><dd class="num">{fmtPrice(row.rates.hp)}</dd></div>
    {:else}
      <div class="tempo" class:pulse={COLOURS.some((c) => changed.has(`${c}_hc`) || changed.has(`${c}_hp`))}>
        <dt class="visually-hidden">{m.tariffSummary.tempoTable}</dt>
        <dd>
        <table aria-label={m.tariffSummary.tempoTable}>
          <thead>
            <tr><th scope="col"><span class="visually-hidden">{m.tariffSummary.colour}</span></th>
              <th scope="col"><Swatch series="hc" size={10} />{m.tariffSummary.hc}</th>
              <th scope="col"><Swatch series="hp" size={10} />{m.tariffSummary.hp}</th></tr>
          </thead>
          <tbody>
            {#each COLOURS as c (c)}
              <tr><th scope="row"><TempoDot colour={c} />{m.grid.colour[c]}</th>
                <td class="num">{fmtAmount(row.rates[`${c}_hc`], 4)}</td><td class="num">{fmtAmount(row.rates[`${c}_hp`], 4)}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="unit">{m.tariffSummary.unit}</p>
        </dd>
      </div>
    {/if}
    {#each seasons as s, i (i)}
      <div class="hours" class:pulse={changed.has('hours')}>
        <dt>{m.tariff.hc}{#if s.label}<span class="season"> · {s.label}</span>{/if}</dt>
        <dd class="num">{slotsText(s.slots)}</dd>
        <dd class="bar"><TariffBand blocks={dayBlocks(s.slots)} label={m.tariffSummary.hoursLabel(slotsText(s.slots))} height={14} /></dd>
      </div>
    {/each}
  </dl>
{/if}

<style>
  .sum {
    display: grid;
    margin: 0;
    font-size: 14px;
  }
  .r {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px 16px;
    flex-wrap: wrap;
    min-height: 40px;
    padding: 4px 0;
  }
  .r,
  .tempo,
  .hours {
    border-top: 1px solid var(--line);
  }
  dt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--mu);
  }
  dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
  }
  .season {
    color: var(--fa);
  }
  .hours {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 16px;
    padding-bottom: 4px;
  }
  .hours dt,
  .hours > dd.num {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .hours dt {
    justify-content: flex-start;
    color: var(--mu);
  }
  .hours > dd.num {
    font-weight: 500;
    color: var(--mu);
  }
  .bar {
    grid-column: 1 / -1;
    font-weight: 400;
    text-align: left;
  }
  .tempo dd {
    text-align: left;
    font-weight: 400;
  }
  .tempo {
    padding: 8px 0 10px;
    min-width: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 0;
    text-align: right;
    font-weight: 500;
  }
  thead th {
    color: var(--mu);
    font-size: 12px;
  }
  thead th :global(.sw) {
    margin-right: 6px;
  }
  tbody th {
    text-align: left;
    color: var(--mu);
  }
  tbody th :global(.dot) {
    margin-right: 8px;
  }
  td {
    font-weight: 600;
  }
  .unit {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--fa);
    text-align: right;
  }
  /* A saved row: opacity 1 → .55 → 1, like the Programme copy pulse. */
  .pulse {
    animation: kv-pulse-row 700ms var(--ease-out) 1;
  }
  @keyframes kv-pulse-row {
    40% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
