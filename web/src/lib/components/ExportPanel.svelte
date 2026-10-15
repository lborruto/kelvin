<script lang="ts">
  import type { EnergyDay, EnergyReport } from '$lib/api/types';
  import { curveCsv, download, energyCsv, roomsCsv } from '$lib/csv';
  import type { Span } from '$lib/energy';
  import { fmtDay } from '$lib/format';
  import { roomEnergy } from '$lib/roomEnergy';
  import { house } from '$lib/stores/house.svelte';

  const COPY = {
    title: 'Exporter',
    period: 'Exporter la période (CSV)',
    curve: (d: string) => `Exporter la courbe du ${d} (CSV)`,
    rooms: 'Exporter par pièce (CSV)',
    format:
      'Fichiers CSV\u00a0: séparateur point-virgule, décimales avec une virgule, dates ISO avec leur fuseau, cellule vide quand une valeur manque. Les chiffres de la page, avec toutes leurs décimales.'
  } as const;

  interface Props {
    chart: EnergyReport;
    main: EnergyReport;
    period: Span;
    /** The period's elapsed days (up to yesterday): what `by_radiator` counts, as Par pièce shows it. */
    roomSpan: Span;
    day: EnergyDay | null;
    class?: string;
  }
  let { chart, main, period, roomSpan: span, day, class: cls = '' }: Props = $props();

  function exportRooms() {
    if (!house.loaded) return;
    download(roomsCsv(roomEnergy(main.by_radiator, house.rooms, house.radiators, span), span));
  }
</script>

<section class="panel {cls}">
  <h2>{COPY.title}</h2>
  <div class="actions">
    <button type="button" class="btn btn-ghost" onclick={() => download(energyCsv(chart, main, period))}>{COPY.period}</button>
    {#if day && day.points > 0}
      <button type="button" class="btn btn-ghost" onclick={() => download(curveCsv(day))}>{COPY.curve(fmtDay(day.date))}</button>
    {/if}
    {#if main.by_radiator.length}
      <!-- Held (aria-disabled) until the house is known: the file names rooms and radiators. It holds its place, so nothing moves. -->
      <button type="button" class="btn btn-ghost" aria-disabled={!house.loaded} onclick={exportRooms}>{COPY.rooms}</button>
    {/if}
  </div>
  <p class="muted note">{COPY.format}</p>
</section>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    font-size: 12px;
    margin: 10px 0 0;
  }
</style>
