<!-- Mois's « Courbe du 15 octobre » widget (spec §4 Énergie, row 2): the Courbe's day as mini bars, one per
     half-hour (heures creuses hatched at the base, as the Courbe cuts them by each half-hour's off-peak share), and
     the day's figures from the same idle readout as the Courbe (`readDay`: the bar's own kWh, €, peak). « par
     demi-heure › » opens the full Courbe in a sheet (scrubber, readout, notes). A day without a curve says why there. -->
<script lang="ts">
  import type { EnergyDay } from '$lib/api/types';
  import { fmtDateLong } from '$lib/format';
  import { m } from '$lib/i18n';
  import { readDay, type Inspection } from '$lib/inspector';
  import MiniBars from './MiniBars.svelte';

  interface Props {
    dayIso: string;
    day: EnergyDay | null;
    /** A tariff exists: the off-peak cut is drawn. */
    split: boolean;
    /** The day bar's inspection (its kWh and € as the bar reads them). */
    bar?: Inspection | null;
    onopen: () => void;
    class?: string;
  }
  let { dayIso, day, split, bar = null, onopen, class: cls = '' }: Props = $props();
  const uid = $props.id();

  let shown = $derived(day && day.date === dayIso ? day : null);
  let ivs = $derived(shown?.intervals ?? []);
  let values = $derived(ivs.map((iv) => iv.wh / 1000));
  let parts = $derived(
    split && ivs.some((iv) => iv.offpeak != null)
      ? ivs.map((iv) => (iv.offpeak == null ? null : { hc: (iv.wh * iv.offpeak) / 1000, hp: (iv.wh * (1 - iv.offpeak)) / 1000 }))
      : null
  );
  let idle = $derived(shown && shown.points > 0 ? readDay(shown, bar, { intervals: shown.intervals, samples: null, room: null, tariff: split }) : null);
  let line = $derived(
    idle
      ? ['energy', 'cost', 'power']
          .map((k) => idle.rows.find((r) => r.key === k)?.value)
          .filter((v): v is string => !!v && v !== '—')
          .join(' · ')
      : null
  );
</script>

<section class="panel w-curve {cls}" aria-labelledby="{uid}-t">
  <div class="head">
    <h3 id="{uid}-t">{m.curvePanel.heading(fmtDateLong(dayIso))}</h3>
    <button type="button" class="more" onclick={onopen}>{m.energyBoard.curveMore}</button>
  </div>
  <p class="line num">{line ?? '—'}</p>
  {#if !shown}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if shown.points === 0}
    <p class="why">{m.energyBoard.curveNone}</p>
  {:else}
    <MiniBars {values} {parts} height={120} gap={1} label={m.energyBoard.curveMiniLabel(fmtDateLong(dayIso))} />
  {/if}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
  }
  .more {
    min-height: 44px;
    margin: -12px 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
    white-space: nowrap;
    cursor: pointer;
  }
  .more::after {
    content: ' ›';
    white-space: pre;
  }
  @media (hover: hover) {
    .more:hover {
      color: var(--tx);
    }
  }
  .line {
    margin: 2px 0 12px;
    font-size: var(--fs-label);
    color: var(--mu);
  }
  .sk {
    height: 124px;
  }
  .why {
    margin: 0;
    min-height: 124px;
    font-size: 13px;
    color: var(--mu);
  }
</style>
