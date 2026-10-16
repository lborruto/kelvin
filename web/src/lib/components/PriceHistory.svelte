<!-- « Historique des prix » (Tableau §4 « Tarif », mockups 5): one row per dated price, newest first: « Depuis le
     1 février 2025 » over its option and subscription (muted), its prices on the right (mono, €/kWh, 4
     decimals). Past days keep the prices of their own row. The successive off-peak hours follow when the tariff
     has any. -->
<script lang="ts">
  import type { HcVariant, Slot, Tariff, TariffRow } from '$lib/api/types';
  import { fmtAmount, fmtDateLong, fmtEurExact } from '$lib/format';
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
  let rows = $derived([...tariff.prices].sort((a, b) => b.valid_from.localeCompare(a.valid_from)));
</script>

<ul class="hist" aria-label={m.tariff.history}>
  {#each rows as p (p.valid_from)}
    <li>
      <span class="when"><span>{m.tariff.sinceDate(fmtDateLong(p.valid_from))}</span><small
          >{m.tariff.options[p.option]} · {m.tariffSummary.perMonth(fmtEurExact(p.subscription_eur_month))}</small></span>
      <span class="rates mono">{rates(p)}</span>
    </li>
  {/each}
</ul>
{#if tariff.hc_schedules.length}
  <h3>{m.tariff.schedules}</h3>
  <ul class="schedules">
    {#each tariff.hc_schedules as s (s.valid_from)}<li>{m.tariff.scheduleLine(fmtDateLong(s.valid_from), s.variants.map(variant).join(' ; '))}</li>{/each}
  </ul>
{/if}

<style>
  .hist,
  .schedules {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .hist li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px 16px;
    min-height: 48px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
    font-size: 14px;
  }
  .when {
    display: grid;
    min-width: 0;
    color: var(--mu);
  }
  .when small {
    font-size: 12.5px;
    color: var(--fa);
  }
  .rates {
    font-size: 12px;
    font-weight: 600;
    text-align: right;
    overflow-wrap: anywhere;
  }
  h3 {
    margin: 12px 0 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--mu);
  }
  .schedules {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--mu);
  }
</style>
