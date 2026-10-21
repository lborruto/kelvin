<!-- A room's desktop column on Maison (Tableau §4 « Grid »): its name and radiator count, the room widget with
     its −/+ and today's sparkline, then the round-icon tiles: Chauffe temp. (launch, or its end in heat while it
     runs) and Programme (the next change), then Radiateurs (several) or Fenêtre (one radiator that reports it).
     A tile a room cannot use is absent, never greyed (capability gating). -->
<script lang="ts">
  import type { Room } from '$lib/api/types';
  import { boostEndMs } from '$lib/away';
  import { roomControls } from '$lib/capabilities';
  import { fmtTime, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { m } from '$lib/i18n';
  import { nextLevelText, radiatorsText } from '$lib/dashboard';
  import { ROUTES, roomSheetHref } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { roomStatus, sharedProgram } from '$lib/status';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import IconTile from '../IconTile.svelte';
  import MaisonRoom from './MaisonRoom.svelte';

  interface Props {
    room: Room;
    now: number;
    points: StripPoint[];
    start: number;
    end: number;
  }
  let { room, now, points, start, end }: Props = $props();
  const uid = $props.id();

  let rads = $derived(house.roomRadiators(room.id));
  let rc = $derived(roomControls(rads));
  let override = $derived(house.overrideFor(room.id));
  let status = $derived(roomStatus(room, rads, override, house.roomExpected(room.id), now));
  let name = $derived(roomName(room));
  let href = $derived(ROUTES.room(room.id));
  let boosting = $derived(override?.kind === 'boost' && !override.restoring);
  let boostEnd = $derived(
    override?.kind === 'boost'
      ? parisTodayIso(boostEndMs(override)) === parisTodayIso(now)
        ? fmtTime(boostEndMs(override))
        : fmtWeekdayTime(boostEndMs(override))
      : ''
  );
  let program = $derived(sharedProgram(rads) ?? rads[0]?.program ?? null);
  let mode = $derived(house.roomExpected(room.id).mode ?? room.mode);
  let programSub = $derived(mode === 'program' ? (nextLevelText(program, now) ?? m.maison.progNone) : m.maison.paused);
  let heatingRads = $derived(rads.some((r) => r.reachable !== false && (r.working_rate ?? 0) > 0) && status.kind !== 'off');
  let windowTile = $derived(rads.length === 1 && rads[0].window_detection);
</script>

<section class="col" aria-labelledby="{uid}-h">
  <div class="areah"><h2 id="{uid}-h">{name}</h2><span>{m.maison.radiatorCount(rads.length)}</span></div>
  <MaisonRoom {room} {now} layout="widget" {points} {start} {end} />
  {#if rc.controllable > 0}
    <div class="two">
      {#if rc.boost > 0}
        <div class="keep" data-sveltekit-noscroll data-sveltekit-keepfocus><IconTile layout="stack" icon="bolt" tone={boosting ? 'heat' : null} title={m.kit.boostShort}
          sub={boosting ? m.maison.boostUntil(boostEnd) : m.maison.boostLaunch} href={boosting ? href : roomSheetHref(ROUTES.rooms, room.id, { boost: true })}
          ariaLabel={`${m.boost.title} · ${name} · ${boosting ? m.maison.boostUntil(boostEnd) : m.maison.boostLaunch}`} inert={!house.online} /></div>
      {/if}
      {#if rc.program > 0}
        <IconTile layout="stack" icon="cal" title={m.mode.program} sub={programSub} href="{ROUTES.schedule}?room={encodeURIComponent(room.id)}"
          ariaLabel={`${m.mode.program} · ${name} · ${programSub}`} />
      {/if}
    </div>
  {/if}
  {#if windowTile}
    <IconTile icon="window" title={m.maison.window} sub={room.window_open ? m.maison.windowOpen : m.maison.windowClosed} {href}
      ariaLabel={`${m.maison.window} · ${name} · ${room.window_open ? m.maison.windowOpen : m.maison.windowClosed}`} />
  {:else}
    <IconTile icon="rad" tone={heatingRads ? 'heat' : null} title={m.maison.radiators} sub={radiatorsText(rads, name, status.kind === 'off')} {href}
      ariaLabel={`${m.maison.radiators} · ${name} · ${radiatorsText(rads, name, status.kind === 'off')}`} />
  {/if}
</section>

<style>
  .col {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }
  .areah {
    margin: 0 4px 2px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .keep {
    display: contents;
  }
  .two > :global(:only-child) {
    grid-column: span 2;
  }
</style>
