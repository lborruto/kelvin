<!-- « Hier » (Tableau §4 energy column): yesterday's kWh from the Linky day reading, its ≈ € (the report's figure,
     rounded once in the backend) and the half-hour bars of its curve (off-peak hatched under peak when a tariff
     is set). No reading yet: one sentence, never 0. -->
<script lang="ts">
  import type { EnergyDay, EnergyReport } from '$lib/api/types';
  import { fmtEurExact, fmtKwhExact, fmtKwhHero } from '$lib/format';
  import { m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import Fig from '../Fig.svelte';
  import MiniBars from '../MiniBars.svelte';
  import Widget from '../Widget.svelte';

  interface Props {
    report: EnergyReport | null | undefined;
    curve: EnergyDay | null | undefined;
    now: number;
  }
  let { report, curve, now }: Props = $props();
  let t = $derived(report?.total ?? null);
  let kwh = $derived(t?.kwh ?? null);
  let bars = $derived((curve?.intervals ?? []).map((i) => i.wh / 1000));
  let parts = $derived(
    curve?.intervals.some((i) => i.offpeak != null)
      ? curve.intervals.map((i) => (i.offpeak == null ? null : { hc: (i.wh / 1000) * i.offpeak, hp: (i.wh / 1000) * (1 - i.offpeak) }))
      : null
  );
</script>

<Widget title={m.maison.yesterday} pad="md">
  {#snippet meta()}{#if kwh != null}<Fig value={fmtKwhHero(kwh)} title={m.maison.yesterday}
        rows={[{ label: m.maison.billKwh, value: fmtKwhExact(kwh) }, ...(t?.eur != null ? [{ label: m.maison.billTotal, value: fmtEurExact(t.eur) }] : [])]}
        provenance={provenance('linky-day', { day: report?.last_day ?? null }, now)} />{/if}{/snippet}
  {#if report === undefined || curve === undefined}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if kwh == null}
    <p class="none">{m.maison.yesterdayNone}</p>
  {:else}
    {#if bars.length}<MiniBars values={bars} {parts} gap={1} height={46} label={m.maison.yesterdayBars(fmtKwhExact(kwh))} />{/if}
    {#if t?.eur != null}<p class="note eur">{m.maison.yesterdayEur(fmtEurExact(t.eur))}</p>{/if}
  {/if}
</Widget>

<style>
  p {
    margin: 0;
  }
  .sk {
    height: 66px;
  }
  .none {
    color: var(--mu);
    font-size: 13px;
  }
  .eur {
    margin-top: 4px;
  }
</style>
