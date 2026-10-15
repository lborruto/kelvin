<script lang="ts">
  import type { TempoColour, TempoLens } from '$lib/api/types';
  import { fmtEurExact, fmtKwhExact } from '$lib/format';
  import { m } from '$lib/i18n';
  import TempoDot from './TempoDot.svelte';

  interface Props {
    lens: TempoLens;
  }
  let { lens }: Props = $props();
  const colourOf = (key: string) => key.split('_')[0] as TempoColour;
</script>

<table class="tempo" aria-label={m.energyTariff.rowsTitle}>
  <thead><tr><th>{m.energyTariff.colRate}</th><th class="r">{m.energyTariff.colKwh}</th><th class="r">{m.energyTariff.colEur}</th></tr></thead>
  <tbody>
    {#each lens.rows as row (row.key)}
      <tr>
        <td><span class="rate"><TempoDot colour={colourOf(row.key)} />{m.tariff.rateShort[row.key]}</span></td>
        <td class="r num">{fmtKwhExact(row.kwh)}</td>
        <td class="r num">{fmtEurExact(row.eur)}</td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="line">{m.energyTariff.redDays(lens.days.red)}</p>
<p class="muted line">{m.energyTariff.daysLine(m.energyTariff.days(lens.days))}</p>
{#if lens.unknown_kwh != null}<p class="muted line">{m.energyTariff.unknownKwh(fmtKwhExact(lens.unknown_kwh))}</p>{/if}

<style>
  .tempo {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-top: 10px;
  }
  th,
  td {
    padding: 6px 4px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }
  th {
    color: var(--mu);
    font-weight: 500;
  }
  .r {
    text-align: right;
  }
  .rate {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .line {
    font-size: 13px;
    margin: 6px 0 0;
  }
</style>
