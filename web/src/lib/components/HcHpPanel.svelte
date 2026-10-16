<script lang="ts">
  import type { HcLens, TariffOption, TempoLens } from '$lib/api/types';
  import { fmtEurExact, fmtKwhExact, fmtKwhParts, fmtPct1, fmtPrice, fmtSigned, fmtSignedPrice } from '$lib/format';
  import { SERIES } from '$lib/energy';
  import { m } from '$lib/i18n';
  import { ROUTES, ENERGY_ANCHORS } from '$lib/paths';
  import { shiftValue } from '$lib/power';
  import Disclosure from './Disclosure.svelte';
  import Swatch from './Swatch.svelte';
  import TempoRows from './TempoRows.svelte';

  interface Props {
    lens: HcLens | null;
    tariff: boolean;
    /** The period's HP kWh. */
    hpKwh: number | null;
    option?: TariffOption | null;
    tempo?: TempoLens | null;
    /** The period's kWh and its HC kWh: the ring's words, matched to the total (Tableau board). */
    kwh?: number | null;
    hcKwh?: number | null;
    class?: string;
  }
  let { lens, tariff, hpKwh, option = null, tempo = null, kwh = null, hcKwh = null, class: cls = '' }: Props = $props();
  let words = $derived(kwh != null && hcKwh != null && hpKwh != null ? fmtKwhParts(kwh, [hcKwh, hpKwh]).parts : null);
  const uid = $props.id();
  let pct = $state(10);
  /** The ring's circumference (r = 44). */
  const C = 2 * Math.PI * 44;
  let value = $derived(lens && lens.delta_price != null && hpKwh != null ? shiftValue(pct / 100, hpKwh, lens.delta_price) : null);
</script>

<!-- Analyse card (direction-2 §2): the off-peak share against the off-peak hours, with its meter, in L0; the mean
     price, the saving per kWh moved, the simulator and its formula, and the Tempo colours one « Détails » away. -->
<section class="panel {cls}" id={ENERGY_ANCHORS.offpeak}>
  <h3>{m.hcHp.title}</h3>
  {#if !tariff}
    <p class="line"><a href="{ROUTES.tariff}">{m.hcHp.tariffLink}</a>{m.hcHp.tariffTail}</p>
  {:else if option === 'base'}
    <p class="line">{m.energyTariff.baseOption}</p>
  {:else}
    <p class="lead">
      <strong class="num big">{fmtPct1(lens?.hc_share)}</strong>{#if lens?.hc_share != null && lens.slot_share != null}{' '}<span class="muted">{m.energyUi.hcLine(fmtPct1(lens.slot_share))}</span>{/if}
    </p>
    {#if lens?.hc_share != null}
      {@const f = Math.min(1, Math.max(0, lens.hc_share))}
      <!-- The split as a ring (Tableau « Heures creuses / pleines »): heures pleines (dark blue) all round, heures creuses
           (light blue, hatched) from 12 o'clock. Decorative: the sentence above and the hidden line say it. -->
      <div class="ring">
      <svg class="donut" viewBox="0 0 116 116" width="116" height="116" aria-hidden="true">
        <circle cx="58" cy="58" r="44" fill="none" stroke={SERIES.hp} stroke-width="18" />
        {#if f > 0}
          <circle cx="58" cy="58" r="44" fill="none" stroke={SERIES.hc} stroke-width="18" stroke-dasharray="{Math.max(0, C * f - (f < 1 ? 2 : 0))} {C}" transform="rotate(-90 58 58)" />
          <circle cx="58" cy="58" r="44" fill="none" stroke="url(#hc-hatch)" stroke-width="18" stroke-dasharray="{Math.max(0, C * f - (f < 1 ? 2 : 0))} {C}" transform="rotate(-90 58 58)" />
        {/if}
      </svg>
      {#if words}
        <p class="rw num" aria-hidden="true">
          <span><Swatch series="hc" />{m.energyUi.hcPart(words[0])}</span>
          <span><Swatch series="hp" />{m.energyUi.hpPart(words[1])}</span>
        </p>
      {/if}
      </div>
      <p class="visually-hidden">{m.hcHp.share} {fmtPct1(lens.hc_share)}, {m.hcHp.slots(fmtPct1(lens.slot_share))}</p>
    {:else}
      <!-- The backend gives no lens for a tariff without HC slots. -->
      <p class="muted note">{lens ? m.hcHp.none : m.hcHp.noSlots}</p>
    {/if}
    <Disclosure title={m.energyUi.details} meta={m.energyUi.hchpMeta} detail class="more">
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
    </Disclosure>
  {/if}
</section>

<style>
  .figs {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .rows {
    margin-top: 0;
  }
  .lead {
    margin: 0;
    font-size: 13px;
  }
  .panel :global(.disclosure.more) {
    margin-top: 8px;
    border-top: 1px solid var(--line);
  }
  .ring {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    margin-top: 10px;
  }
  .donut {
    display: block;
    flex: none;
  }
  .rw {
    display: grid;
    gap: 8px;
    margin: 0;
    font-size: 13.5px;
  }
  .rw span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
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
