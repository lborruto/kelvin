<!-- The Résumé's split bar (direction-2 §2): 8 px, heures creuses (light blue, hatched) then heures pleines (dark
     blue) by their share of the period's kWh, radius 3, a 1 px knockout between the parts; each part's words under
     its end. Without a split (Base, or no tariff) one series-1 bar and no words. The figures arrive formatted and
     matched to the total (`fmtKwhParts`), so the words add up to the range line. -->
<script lang="ts">
  import { SERIES, seriesBackground } from '$lib/energy';
  import { m } from '$lib/i18n';
  import Swatch from './Swatch.svelte';

  interface Props {
    /** Off-peak share of the kWh (0–1); null draws the unsplit bar. */
    share: number | null;
    /** « 52,3 kWh » — the off-peak part as shown. */
    hc?: string | null;
    hp?: string | null;
  }
  let { share, hc = null, hp = null }: Props = $props();
  let f = $derived(share == null ? null : Math.min(1, Math.max(0, share)));
  let label = $derived(f != null && hc && hp ? m.energyUi.splitLabel(hc, hp) : null);
</script>

{#if f == null}
  <div class="bar" aria-hidden="true"><span class="all" style:background={SERIES.home}></span></div>
{:else}
  <div class="split" role="img" aria-label={label}>
    <div class="bar" class:none={f === 0} class:full={f === 1}>
      <span class="hc" style:flex-basis="{f * 100}%" style:background={seriesBackground('hc')}></span>
      <span class="hp" style:background={SERIES.hp}></span>
    </div>
    {#if hc && hp}
      <p class="words num" aria-hidden="true">
        <span class="w"><Swatch series="hc" size={8} />{m.energyUi.hcPart(hc)}</span>
        <span class="w end"><Swatch series="hp" size={8} />{m.energyUi.hpPart(hp)}</span>
      </p>
    {/if}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    gap: 1px;
    height: 8px;
    margin-top: 12px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--in);
  }
  .bar span {
    min-width: 0;
    transform-origin: left;
    animation: grow var(--t-data) var(--ease-out) both;
  }
  .hc {
    flex: none;
  }
  .hp,
  .all {
    flex: 1 1 auto;
  }
  .none .hc,
  .full .hp {
    display: none;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar span {
      animation: none;
    }
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--tx);
  }
  .w {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .end {
    margin-left: auto;
  }
</style>
