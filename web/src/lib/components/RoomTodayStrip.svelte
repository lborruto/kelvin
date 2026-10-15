<script lang="ts">
  import type { WeekProgram } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    roomId: string;
    height?: number;
    axis?: boolean;
    /** Draw this programme instead of the radiator's (the Programme editor previews its draft). */
    program?: WeekProgram;
    label?: string;
  }
  let { roomId, height = 36, axis = false, program, label }: Props = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  let room = $derived(house.room(roomId));
  let first = $derived(house.roomRadiators(roomId)[0]);
  let expected = $derived(house.roomExpected(roomId));
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  // Same key and step as the room list, so the strips share one fetch.
  let key = $derived(`${roomId}|day|${start}`);
  $effect(() => {
    if (room) history.load(key, room.radiator_ids, start, Math.min(end, now), 900);
  });
</script>

{#if room}
  <ThermalStrip points={history.data[key] ?? []} {start} {end} {now} program={program ?? first?.program} mode={room.mode}
    comfort={room.comfort} eco={room.eco} target={room.target} pendingTarget={expected.target ?? null}
    pendingComfort={expected.comfort ?? null} {height} {axis} label={label ?? m.room.todayLabel(room.name)} />
{/if}
