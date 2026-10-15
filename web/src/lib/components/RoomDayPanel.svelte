<script lang="ts">
  import RoomDayChart from './RoomDayChart.svelte';
  import Segmented from './Segmented.svelte';
  import type { EnergyDay } from '$lib/api/types';
  import { fmtDateLong } from '$lib/format';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { house } from '$lib/stores/house.svelte';

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
  // The rooms with a radiator (temperature and setpoint come from them), in the Pièces order.
  let options = $derived(house.rooms.filter((r) => r.radiator_ids.length > 0).map((r) => ({ value: r.id, label: r.name })));
  // A room that lost its radiators (a live house update) leaves the picker: the first room takes its place, on screen
  // at once and in the day asked for.
  let chosen = $derived(options.some((o) => o.value === room) ? room : (options[0]?.value ?? null));
  $effect(() => {
    if (house.loaded && room != null && chosen != null && chosen !== room) onroom(chosen);
  });
  let ofDay = $derived(day && day.date === dayIso && day.room ? day : null);
  // The chosen room's answer for the Courbe's day. Another room on its way keeps the previous one on screen,
  // dimmed and busy (as a period switch does), so the panel never jumps; another day shows a skeleton.
  let shown = $derived(ofDay && ofDay.room!.id === room ? ofDay : null);
  let stale = $derived(!shown && !error ? ofDay : null);
  let none = $derived(house.loaded && options.length === 0);
  let busy = $derived(!none && !shown && !error);
</script>

<section class="panel {cls}" aria-busy={busy} aria-labelledby="{uid}-title">
  <div class="head">
    <h2 id="{uid}-title">{m.roomDayPanel.title}</h2>
    <p class="muted sub">{m.roomDayPanel.day(fmtDateLong(dayIso))}</p>
  </div>
  {#if none}
    <p class="muted note">{m.roomDayPanel.noRooms}</p>
  {:else}
    <div class="pick">
      {#if !house.loaded}
        <div class="skeleton inset pick-sk" aria-hidden="true"></div>
      {:else if desktop.matches}
        <Segmented {options} value={chosen ?? ''} label={m.roomDayPanel.room} onchange={onroom} />
      {:else}
        <!-- A separate label: a wrapping one would add the chosen room to the select's name. -->
        <div class="field">
          <label class="muted" for="{uid}-room">{m.roomDayPanel.room}</label>
          <select id="{uid}-room" onchange={(e) => onroom(e.currentTarget.value)}>
            {#each options as o (o.value)}<option value={o.value} selected={o.value === chosen}>{o.label}</option>{/each}
          </select>
        </div>
      {/if}
    </div>
    {@const view = shown ?? stale}
    <div class="body" class:stale={!!stale}>
      {#if error && !shown}
        <p class="error" role="status">{error} <button type="button" class="btn btn-sm" onclick={onretry}>{m.roomDayPanel.retry}</button></p>
      {:else if view?.not_counted === 'before_first_day' && view.counted_from}
        <p class="muted note">{m.roomDayPanel.beforeCounted(fmtDateLong(view.counted_from))}</p>
      {:else if view?.room && !view.intervals.length}
        <!-- The room's half-hours are the curve's: without a curve there are none to show. -->
        <p class="muted note">{m.roomDayPanel.noCurve}</p>
      {:else if view?.room}
        <RoomDayChart
          intervals={view.intervals}
          roomId={view.room.id}
          samples={view.room.samples}
          label={m.roomDayPanel.chart(view.room.name, fmtDateLong(view.date))}
          bind:index />
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
</style>
