<script lang="ts">
  import RoomDayChart from './RoomDayChart.svelte';
  import Segmented from './Segmented.svelte';
  import type { EnergyDay } from '$lib/api/types';
  import { SERIES } from '$lib/energy';
  import { fmtDateLong } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { desktop } from '$lib/media.svelte';
  import { house } from '$lib/stores/house.svelte';

  const COPY = {
    title: 'Température et chauffe',
    room: 'Pièce',
    day: (d: string) => `le ${d}`,
    chart: (room: string, d: string) => `Radiateurs, température et consigne · ${room} · ${d}`,
    radiators: 'Radiateurs de la pièce',
    temperature: 'Température',
    setpoint: 'Consigne',
    noRooms: 'Aucune pièce avec un radiateur.',
    retry: 'Réessayer'
  } as const;

  interface Props {
    day: EnergyDay | null;
    dayIso: string;
    room: string | null;
    onroom: (id: string) => void;
    /** The day failed to load (the Courbe says the same): Réessayer asks again. */
    error: string | null;
    onretry: () => void;
    /** The half-hour shared with the Courbe's scrubber. */
    index?: number | null;
    class?: string;
  }
  let { day, dayIso, room, onroom, error, onretry, index = $bindable(null), class: cls = '' }: Props = $props();
  const uid = $props.id();
  // The rooms in the Pièces order (the house's own order, as listed on Pièces and Programme).
  let options = $derived(house.rooms.map((r) => ({ value: r.id, label: r.name })));
  let ofDay = $derived(day && day.date === dayIso && day.room ? day : null);
  // The chosen room's answer for the Courbe's day. Another room on its way keeps the previous one on screen,
  // dimmed and busy (as a period switch does), so the panel never jumps; another day shows a skeleton.
  let shown = $derived(ofDay && ofDay.room!.id === room ? ofDay : null);
  let stale = $derived(!shown && !error ? ofDay : null);
  let none = $derived(house.loaded && options.length === 0);
  let busy = $derived(!none && !shown && !error);
  let heat = `linear-gradient(90deg, ${heatColor(15)}, ${heatColor(20)}, ${heatColor(25)})`;
</script>

<section class="panel {cls}" aria-busy={busy} aria-labelledby="{uid}-title">
  <div class="head">
    <h2 id="{uid}-title">{COPY.title}</h2>
    <p class="muted sub">{COPY.day(fmtDateLong(dayIso))}</p>
  </div>
  {#if none}
    <p class="muted note">{COPY.noRooms}</p>
  {:else}
    <div class="pick">
      {#if !house.loaded}
        <div class="skeleton inset pick-sk" aria-hidden="true"></div>
      {:else if desktop.matches}
        <Segmented {options} value={room ?? options[0].value} label={COPY.room} onchange={onroom} />
      {:else}
        <!-- A separate label: a wrapping one would add the chosen room to the select's name. -->
        <div class="field">
          <label class="muted" for="{uid}-room">{COPY.room}</label>
          <select id="{uid}-room" onchange={(e) => onroom(e.currentTarget.value)}>
            {#each options as o (o.value)}<option value={o.value} selected={o.value === room}>{o.label}</option>{/each}
          </select>
        </div>
      {/if}
    </div>
    {@const view = shown ?? stale}
    <div class="body" class:stale={!!stale}>
      {#if error && !shown}
        <p class="error" role="status">{error} <button type="button" class="btn btn-sm" onclick={onretry}>{COPY.retry}</button></p>
      {:else if view?.room}
        <RoomDayChart
          intervals={view.intervals}
          roomId={view.room.id}
          samples={view.room.samples}
          label={COPY.chart(view.room.name, fmtDateLong(view.date))}
          bind:index />
        <ul class="legend">
          <li><span class="swatch" style:background={SERIES.radiators}></span>{COPY.radiators}</li>
          <li><span class="line" style:background={heat}></span>{COPY.temperature}</li>
          <li><span class="line set"></span>{COPY.setpoint}</li>
        </ul>
      {:else}
        <div class="skeleton inset body-sk" aria-hidden="true"></div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 10px;
  }
  .head h2 {
    margin-bottom: 8px;
  }
  .sub {
    font-size: 12px;
    margin: 0 0 8px;
  }
  /* A long list of rooms scrolls inside the panel, never the page. */
  .pick {
    min-height: 50px;
    margin-bottom: 10px;
    max-width: 100%;
    overflow-x: auto;
  }
  .pick-sk {
    height: 50px;
    max-width: 320px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  select {
    min-height: 44px;
    min-width: 0;
    max-width: 100%;
    padding: 0 10px;
    border: 1px solid var(--field-line);
    border-radius: 8px;
    background: var(--in);
    color: var(--tx);
    font: inherit;
    font-size: var(--fs-field);
  }
  /* The chart's height (readout, plot, axis, legend) while a day loads, so the panels below never move: measured
     at each width where the readout or the legend wraps (one more line under 600 px, two under 360 px). */
  .body {
    --chart-h: 298px;
    min-height: var(--chart-h);
    transition: opacity var(--t-state) ease;
  }
  @media (max-width: 599px) {
    .body {
      --chart-h: 330px;
    }
  }
  @media (max-width: 359px) {
    .body {
      --chart-h: 370px;
    }
  }
  .body.stale {
    opacity: 0.55;
  }
  .body-sk {
    height: var(--chart-h);
  }
  .note {
    font-size: 13px;
    margin: 0;
  }
  .error {
    color: var(--bad);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    font-size: 13px;
  }
  .error .btn {
    color: var(--tx);
  }
  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 0;
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    opacity: 0.55;
  }
  .line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }
  .line.set {
    height: 1px;
    background: var(--mu);
  }
</style>
