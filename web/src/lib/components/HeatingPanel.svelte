<script lang="ts">
  import type { Heating, RadiatorSum } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtEurExact, fmtKwhExact, fmtPct, fmtPct1 } from '$lib/format';

  const COPY = {
    title: 'Chauffage',
    sentence: 'de la consommation de la maison vient des radiateurs',
    days: (n: number, of: number) => ` (${n} jours sur ${of})`,
    parts: (rad: string, rest: string) => `${rad} radiateurs · ${rest} reste`,
    cost: (eur: string) => `Coût du chauffage ≈\u00a0${eur} (énergie, hors abonnement)`,
    noCost: 'Coût du chauffage — (aucun relevé de radiateur sur la période)',
    noTariff: 'Coût du chauffage — (pas de tarif renseigné)',
    unmeasured: 'Aucun jour de radiateur mesuré en entier (jusqu’à hier)\u00a0: somme partielle.',
    partial: (pct: string) => `Radiateurs mesurés sur ${pct} des jours (jusqu’à hier) : somme partielle.`,
    running: 'Période en cours : radiateurs comptés jusqu’à hier.',
    est: 'est.',
    inconsistent: 'Les radiateurs dépassent le compteur : données incohérentes.',
    none: 'Aucun jour couvert à la fois par le Linky et par tous les radiateurs.'
  } as const;

  interface Props {
    heating: Heating;
    /** The period's radiator figures (kWh, €), for the parts and the cost. */
    radiators: RadiatorSum | null;
    restKwh: number | null;
    /** The period runs into today: its radiator figures stop at yesterday. */
    running?: boolean;
    class?: string;
  }
  let { heating, radiators, restKwh, running = false, class: cls = '' }: Props = $props();
  // L7: never clamped; above 102 % it is a data error and reads « — ».
  let value = $derived(heating.inconsistent ? null : heating.value);
</script>

<section class="panel {cls}">
  <h2>{COPY.title}</h2>
  <!-- {' '}: Svelte trims a block's leading space. -->
  <p class="share-line">
    <strong class="num share">{fmtPct(value)}</strong>{#if value != null}{' '}{COPY.sentence}{heating.days < heating.of_days
        ? COPY.days(heating.days, heating.of_days)
        : ''}.{/if}
  </p>
  {#if heating.inconsistent}
    <p class="muted note">{COPY.inconsistent}</p>
  {:else if value == null}
    <p class="muted note">{COPY.none}</p>
  {:else}
    <div class="meter" aria-hidden="true"><span class="rad" style:transform="scaleX({Math.min(1, value)})" style:background={SERIES.radiators}></span></div>
    {#if radiators && restKwh != null}<p class="muted line num">{COPY.parts(fmtKwhExact(radiators.kwh), fmtKwhExact(restKwh))}</p>{/if}
  {/if}
  {#if !radiators}
    <p class="line cost num">{COPY.noCost}</p>
  {:else if radiators.eur == null}
    <!-- A radiator sum has no € only without a tariff. -->
    <p class="line cost num">{COPY.noTariff}</p>
  {:else}
    <p class="line cost num">{COPY.cost(fmtEurExact(radiators.eur))}{#if radiators.interpolated || radiators.apportioned}<span class="est">{COPY.est}</span>{/if}</p>
  {/if}
  {#if radiators?.coverage != null && radiators.coverage < 1}
    <p class="muted note">{radiators.coverage > 0 ? COPY.partial(fmtPct1(radiators.coverage)) : COPY.unmeasured}</p>
  {:else if radiators && running}
    <p class="muted note">{COPY.running}</p>
  {/if}
</section>

<style>
  .share-line {
    font-size: 13px;
    margin: 0;
  }
  .share {
    font-size: 20px;
    font-weight: 600;
  }
  .meter {
    height: 6px;
    margin-top: 10px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  /* Radiators fill from the left; the rest of the home is the well. */
  .meter span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }
  }
  .line {
    font-size: 13px;
    margin: 8px 0 0;
  }
  .note {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
</style>
