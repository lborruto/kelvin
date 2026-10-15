<script lang="ts">
  import type { HcVariant, Slot, Tariff, TariffRow } from '$lib/api/types';
  import { fmtAmount, fmtDateLong } from '$lib/format';
  import { locale, m } from '$lib/i18n';
  import { RATE_KEYS } from '$lib/tariff';

  interface Props {
    tariff: Tariff;
  }
  let { tariff }: Props = $props();
  const rates = (p: TariffRow) => RATE_KEYS[p.option].map((k) => `${m.tariff.rateShort[k]} ${fmtAmount(p.rates[k], 4)}`).join(' · ');
  const slots = (s: Slot[]) => s.map((x) => `${x.start}–${x.end}`).join(', ');
  const month = (mo: number) => new Intl.DateTimeFormat(locale.intl, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mo - 1, 15)));
  const variant = (v: HcVariant) => `${v.months.length === 12 ? m.tariff.allYear : v.months.map(month).join(', ')}${m.common.colon}${slots(v.slots)}`;
</script>

<div class="table-wrap">
  <table aria-label={m.tariff.history}>
    <thead><tr><th>{m.tariff.since}</th><th>{m.tariff.colOption}</th><th class="r">{m.tariff.subscription}</th><th>{m.tariff.colRates}</th></tr></thead>
    <tbody>
      {#each tariff.prices as p (p.valid_from)}
        <tr><td>{fmtDateLong(p.valid_from)}</td><td>{m.tariff.options[p.option]}</td><td class="r mono">{fmtAmount(p.subscription_eur_month, 2)}</td><td class="mono">{rates(p)}</td></tr>
      {/each}
    </tbody>
  </table>
</div>
<ul class="history-list" aria-label={m.tariff.history}>
  {#each tariff.prices as p (p.valid_from)}
    <li>
      <dl>
        <dt>{m.tariff.since}</dt><dd>{fmtDateLong(p.valid_from)}</dd>
        <dt>{m.tariff.colOption}</dt><dd>{m.tariff.options[p.option]}</dd>
        <dt>{m.tariff.subscription}</dt><dd class="mono">{fmtAmount(p.subscription_eur_month, 2)}</dd>
        <dt>{m.tariff.colRates}</dt><dd class="mono">{rates(p)}</dd>
      </dl>
    </li>
  {/each}
</ul>
{#if tariff.hc_schedules.length}
  <h4>{m.tariff.schedules}</h4>
  <ul class="schedules">
    {#each tariff.hc_schedules as s (s.valid_from)}<li>{m.tariff.scheduleLine(fmtDateLong(s.valid_from), s.variants.map(variant).join(' ; '))}</li>{/each}
  </ul>
{/if}

<style>
  /* min-width: 0 lets the grid item shrink below the table's width, so the page never scrolls. */
  .table-wrap {
    overflow-x: auto;
    min-width: 0;
  }
  .history-list {
    display: none;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .history-list li {
    border-top: 1px solid var(--line);
    padding: 10px 0;
  }
  .history-list li:last-child {
    border-bottom: 1px solid var(--line);
  }
  .history-list dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
  }
  .history-list dt {
    color: var(--mu);
  }
  .history-list dd {
    margin: 0;
    text-align: right;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  @media (max-width: 599px) {
    .table-wrap {
      display: none;
    }
    .history-list {
      display: block;
    }
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    padding: 8px 6px;
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
  td.mono {
    white-space: normal;
  }
  h4 {
    margin: 14px 0 6px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
  }
  .schedules {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    display: grid;
    gap: 4px;
  }
</style>
