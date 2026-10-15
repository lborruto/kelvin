<script lang="ts">
  import type { HcLens, TariffOption, TempoLens } from '$lib/api/types';
  import { fmtEurExact, fmtKwhExact, fmtPct1, fmtPrice, fmtSigned, fmtSignedPrice } from '$lib/format';
  import { SERIES, seriesBackground } from '$lib/energy';
  import { m } from '$lib/i18n';
  import { ANCHORS, ROUTES, ENERGY_ANCHORS } from '$lib/paths';
  import { shiftValue } from '$lib/power';
  import TempoRows from './TempoRows.svelte';

  interface Props {
    lens: HcLens | null;
    tariff: boolean;
    /** The period's HP kWh. */
    hpKwh: number | null;
    option?: TariffOption | null;
    tempo?: TempoLens | null;
    class?: string;
  }
  let { lens, tariff, hpKwh, option = null, tempo = null, class: cls = '' }: Props = $props();
  const uid = $props.id();
  let pct = $state(10);
  let value = $derived(lens && lens.delta_price != null && hpKwh != null ? shiftValue(pct / 100, hpKwh, lens.delta_price) : null);
</script>

<section class="panel {cls}" id={ENERGY_ANCHORS.offpeak}>
  <h2>{m.hcHp.title}</h2>
  {#if !tariff}
    <p class="line"><a href="{ROUTES.home}#{ANCHORS.tariff}">{m.hcHp.tariffLink}</a>{m.hcHp.tariffTail}</p>
  {:else if option === 'base'}
    <p class="line">{m.energyTariff.baseOption}</p>
  {:else}
    <dl class="figs">
      <div>
        <dt>{m.hcHp.share}</dt>
        <dd><strong class="num big">{fmtPct1(lens?.hc_share)}</strong></dd>
      </div>
    </dl>
    {#if lens?.hc_share != null}
      <!-- The split as a meter: heures creuses (light blue, hatched) then heures pleines (dark blue). -->
      <div class="split" aria-hidden="true">
        <span class="hc" style:flex-basis="{Math.min(1, Math.max(0, lens.hc_share)) * 100}%" style:background={seriesBackground('hc')}></span>
        <span class="hp" style:background={SERIES.hp}></span>
      </div>
      <p class="muted line">{m.hcHp.slots(fmtPct1(lens.slot_share))}</p>
    {:else}
      <!-- The backend gives no lens for a tariff without HC slots. -->
      <p class="muted note">{lens ? m.hcHp.none : m.hcHp.noSlots}</p>
    {/if}
    <dl class="figs rows">
      <div>
        <dt>{m.hcHp.avg}</dt>
        <dd class="num">{fmtPrice(lens?.avg_price)}</dd>
      </div>
      {#if lens && lens.delta_price != null}
        <div>
          <dt>{m.hcHp.perKwh}</dt>
          <dd class="num">{fmtSignedPrice(-lens.delta_price)}</dd>
        </div>
      {/if}
    </dl>
    {#if lens && lens.delta_price != null && hpKwh != null && lens.hc_share != null && value != null}
      <div class="shift">
        <label for="{uid}-shift">{m.hcHp.slider}</label>
        <input id="{uid}-shift" type="range" min="0" max="50" step="5" aria-valuetext={m.hcHp.valueText(pct)} bind:value={pct} />
        <p class="line num">{m.hcHp.result(pct, fmtKwhExact((pct / 100) * hpKwh), fmtSigned(-value, '€'))}</p>
        <p class="muted note num">{m.hcHp.formula(pct, fmtKwhExact(hpKwh), fmtPrice(lens.delta_price), fmtEurExact(value))}</p>
      </div>
      <p class="muted note">{m.hcHp.caveat}</p>
    {/if}
    {#if tempo}<TempoRows lens={tempo} />{/if}
  {/if}
</section>

<style>
  .figs {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .rows {
    margin-top: 10px;
  }
  .split {
    display: flex;
    gap: 1px;
    height: 6px;
    margin-top: 8px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--in);
  }
  .split span {
    min-width: 0;
  }
  .split .hc {
    flex: none;
  }
  .split .hp {
    flex: 1 1 auto;
  }
  .figs div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 12px;
  }
  dt,
  label {
    color: var(--mu);
    font-size: 13px;
  }
  dd {
    margin: 0 0 0 auto;
    font-size: 13px;
    text-align: right;
  }
  .big {
    font-size: 20px;
    font-weight: 600;
  }
  .line {
    font-size: 13px;
    margin: 4px 0 0;
  }
  .note {
    font-size: 12px;
    margin: 4px 0 0;
  }
  .shift {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  /* A 44 px tall target. The track takes the field line (3:1 on the panel in both themes), the thumb the ink:
     no new colour. The global focus ring stays. */
  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    height: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    accent-color: var(--tx);
    background: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: var(--field-line);
  }
  input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--field-line);
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border: 0;
    border-radius: 8px;
    background: var(--tx);
  }
  input[type='range']::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 8px;
    background: var(--tx);
  }
  a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
