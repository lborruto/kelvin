<!-- « Maintenant » (spec §3 « MaintenantCard », decision 3): the tariff period in force now, its price per kWh
     (a Fig: exact value, Provenance « Votre tarif »), when it ends and the next price, over the 24 h band with
     the now marker. HC/HP: « Heures pleines · jusqu’à 22:00, puis creuses à 0,2000 € ». Tempo (only when the
     price row in force is Tempo): the day's colour in the header, tomorrow's colour and prices under the band;
     a price whose Tempo colour is unknown reads « — » with its reason. Base: « Prix unique 0,2516 €/kWh »,
     no band. No tariff: one line and « Renseigner le tarif ». Pure view of `$lib/maintenant`. -->
<script lang="ts">
  import type { GridView, Tariff } from '$lib/api/types';
  import { fmtKwhPrice, fmtPrice, fmtTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { hcText, maintenant } from '$lib/maintenant';
  import { ROUTES } from '$lib/paths';
  import { provenance } from '$lib/provenance';
  import { parisMinuteOfDay } from '$lib/time';
  import Fig from './Fig.svelte';
  import Swatch from './Swatch.svelte';
  import TariffBand from './TariffBand.svelte';
  import TempoDot from './TempoDot.svelte';
  import Widget from './Widget.svelte';

  interface Props {
    tariff: Tariff | null;
    grid: GridView | null;
    now: number;
    level?: 'h2' | 'h3' | 'h4';
    span?: 1 | 2;
  }
  let { tariff, grid, now, level = 'h3', span = 1 }: Props = $props();

  let n = $derived(maintenant(tariff, grid, now));
  let periodName = (p: 'hc' | 'hp') => (p === 'hc' ? m.now.hc : m.now.hp);
  let prov = $derived(provenance('tariff', {}, now));
</script>

<Widget title={m.now.title} {level} {span}>
  {#snippet meta()}
    {#if n.kind === 'tempo'}<TempoDot colour={n.tempo?.colour ?? null} />{n.tempo?.colour ? m.now.tempoDay(m.grid.colour[n.tempo.colour]) : m.now.colourUnknown}
    {:else if n.kind === 'hchp'}{m.now.hchp(m.tariff.kvaValue(n.kva))}
    {:else if n.kind === 'base'}{m.tariff.kvaValue(n.kva)}{/if}
  {/snippet}
  {#if n.kind === 'none'}
    <p class="none">{m.now.none}</p>
    <a class="btn btn-sm" href={ROUTES.tariff}>{m.now.setTariff}</a>
  {:else if n.kind === 'base'}
    <p class="base">{m.now.base(fmtPrice(n.price))}</p>
  {:else}
    <div class="top">
      <div class="per">
        <p class="name"><Swatch series={n.period} />{periodName(n.period)}</p>
        <p class="then">
          {n.next.price != null
            ? m.now.then(fmtTime(n.next.at), n.next.period === 'hc', fmtKwhPrice(n.next.price))
            : m.now.thenUnknown(fmtTime(n.next.at), n.next.period === 'hc')}
        </p>
      </div>
      <div class="price">
        <span class="t-reading big"><Fig value={fmtKwhPrice(n.price)} title={m.now.priceTitle} empty={n.price == null ? m.now.colourUnknown : null}
            rows={[
              { label: m.now.period, value: periodName(n.period) },
              { label: m.now.title, value: fmtPrice(n.price), note: n.price == null ? m.now.colourUnknown : null },
              { label: m.now.nextLabel, value: `${periodName(n.next.period)} · ${fmtPrice(n.next.price)}` }
            ]}
            provenance={prov} /></span>
        <span class="note">{m.now.perKwh}</span>
      </div>
    </div>
    <TariffBand blocks={n.blocks} label={m.now.band(hcText(n.blocks))} now={parisMinuteOfDay(now)} nowLabel={fmtTime(now)} />
    {#if n.kind === 'tempo' && n.tempo}
      <p class="tomorrow">
        <span class="tm">{m.now.tomorrow} <TempoDot colour={n.tempo.tomorrow.colour} /><b>{n.tempo.tomorrow.colour ? m.grid.colour[n.tempo.tomorrow.colour] : '—'}</b></span>
        {#if n.tempo.tomorrow.colour}<span class="muted">{m.now.tomorrowPrices(fmtKwhPrice(n.tempo.tomorrow.hp), fmtKwhPrice(n.tempo.tomorrow.hc))}</span>{/if}
      </p>
    {/if}
  {/if}
</Widget>

<style>
  p {
    margin: 0;
  }
  .none {
    margin-bottom: 12px;
    color: var(--mu);
    font-size: 14px;
  }
  .base {
    font-size: 18px;
    font-weight: 600;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .per {
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .then {
    margin-top: 2px;
    color: var(--mu);
    font-size: 13px;
  }
  .price {
    display: grid;
    justify-items: end;
    flex: none;
    text-align: right;
  }
  .big {
    font-size: 26px;
    white-space: nowrap;
  }
  .tomorrow {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 12px;
    margin-top: 6px;
    font-size: 13px;
  }
  .tm {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  b {
    font-weight: 600;
  }
  @media (min-width: 1024px) {
    .name {
      font-size: 20px;
    }
    .big {
      font-size: 28px;
    }
  }
</style>
