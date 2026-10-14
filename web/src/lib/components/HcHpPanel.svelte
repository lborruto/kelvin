<script lang="ts">
  import type { HcLens } from '$lib/api/types';
  import { fmtAmount, fmtEurExact, fmtKwhExact, fmtPct1, fmtPrice, fmtSigned, fmtSignedPrice } from '$lib/format';
  import { shiftValue } from '$lib/power';

  const COPY = {
    title: 'Heures creuses / pleines',
    tariffLink: 'Renseignez le tarif',
    tariffTail: ' pour voir la répartition.',
    share: 'Part en heures creuses',
    slots: (pct: string) => `vos heures creuses durent ${pct} de la journée`,
    none: 'Aucune consommation Linky sur la période.',
    noSlots: 'Le tarif n’a pas d’heures creuses.',
    avg: 'Prix moyen payé',
    perKwh: 'Chaque kWh passé d’HP en HC',
    slider: 'Part de vos heures pleines déplacée en heures creuses',
    valueText: (pct: number) => `${pct} %`,
    result: (pct: number, kwh: string, eur: string) => `Si ${pct} % de vos HP (${kwh}) étaient en HC : ${eur}, à consommation identique.`,
    formula: (pct: number, hp: string, delta: string, eur: string) => `${pct} % × ${hp} × ${delta} €/kWh = ${eur}`,
    caveat: 'Calcul sur vos prix et votre consommation, pas une économie garantie.'
  } as const;

  interface Props {
    lens: HcLens | null;
    tariff: boolean;
    /** The period's HP kWh. */
    hpKwh: number | null;
    class?: string;
  }
  let { lens, tariff, hpKwh, class: cls = '' }: Props = $props();
  const uid = $props.id();
  let pct = $state(10);
  let value = $derived(lens && hpKwh != null ? shiftValue(pct / 100, hpKwh, lens.delta_price) : null);
</script>

<section class="panel {cls}">
  <h2>{COPY.title}</h2>
  {#if !tariff}
    <p class="line"><a href="/maison#tarif">{COPY.tariffLink}</a>{COPY.tariffTail}</p>
  {:else}
    <dl class="figs">
      <div>
        <dt>{COPY.share}</dt>
        <dd><strong class="num big">{fmtPct1(lens?.hc_share)}</strong></dd>
      </div>
    </dl>
    {#if lens?.hc_share != null}
      <p class="muted line">{COPY.slots(fmtPct1(lens.slot_share))}</p>
    {:else}
      <!-- The backend gives no lens for a tariff without HC slots. -->
      <p class="muted note">{lens ? COPY.none : COPY.noSlots}</p>
    {/if}
    <dl class="figs rows">
      <div>
        <dt>{COPY.avg}</dt>
        <dd class="num">{fmtPrice(lens?.avg_price)}</dd>
      </div>
      {#if lens}
        <div>
          <dt>{COPY.perKwh}</dt>
          <dd class="num">{fmtSignedPrice(-lens.delta_price)}</dd>
        </div>
      {/if}
    </dl>
    {#if lens && hpKwh != null && lens.hc_share != null && value != null}
      <div class="shift">
        <label for="{uid}-shift">{COPY.slider}</label>
        <input id="{uid}-shift" type="range" min="0" max="50" step="5" aria-valuetext={COPY.valueText(pct)} bind:value={pct} />
        <p class="line num">{COPY.result(pct, fmtKwhExact((pct / 100) * hpKwh), fmtSigned(-value, '€'))}</p>
        <p class="muted note num">{COPY.formula(pct, fmtKwhExact(hpKwh), fmtAmount(lens.delta_price, 4), fmtEurExact(value))}</p>
      </div>
      <p class="muted note">{COPY.caveat}</p>
    {/if}
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
  /* A 44 px tall target; the thumb and track take the ink (no new colour). */
  input[type='range'] {
    display: block;
    width: 100%;
    height: 44px;
    margin: 0;
    accent-color: var(--tx);
    background: none;
  }
  a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
