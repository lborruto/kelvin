<!-- One room on the Maison tableau (Tableau §4): the kit RoomTile fed from the house. `tile` is the phone's
     two-column tile, `widget` the desktop column's head widget with its MiniSpark. The tile body opens the room
     sheet; the −/+ changes Manuel's setpoint, or Confort in Programme (`primarySetpoint`), and sends once the owner
     stops (Stepper, `$lib/send`); during an Éco period a line says when the new Confort applies. No
     stepper when a command cannot work (Arrêt, window, absence, offline, read-only): a note says why instead. -->
<script lang="ts">
  import type { Room } from '$lib/api/types';
  import { retry, run } from '$lib/actions';
  import { roomControls } from '$lib/capabilities';
  import { fmtTemp, fmtTempShort, fmtTime, fmtWeekdayTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { tileLine } from '$lib/dashboard';
  import { ROUTES, roomSheetHref } from '$lib/paths';
  import { comfortBands } from '$lib/program';
  import { nextComfortAt, primaryLabel, primarySetpoint, sendPrimary } from '$lib/setpoint';
  import { roomName } from '$lib/setup';
  import { roomReading, roomStatus, sharedProgram } from '$lib/status';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import MiniSpark from '../MiniSpark.svelte';
  import PendingTag from '../PendingTag.svelte';
  import RoomTile from '../RoomTile.svelte';
  import Stepper from '../Stepper.svelte';

  interface Props {
    room: Room;
    now: number;
    layout?: 'tile' | 'widget';
    /** Today's readings (widget layout): the MiniSpark. */
    points?: StripPoint[];
    start?: number;
    end?: number;
    class?: string;
  }
  let { room, now, layout = 'tile', points = [], start = 0, end = 0, class: cls = '' }: Props = $props();

  let rads = $derived(house.roomRadiators(room.id));
  let expected = $derived(house.roomExpected(room.id));
  let override = $derived(house.overrideFor(room.id));
  let status = $derived(roomStatus(room, rads, override, expected, now));
  let name = $derived(roomName(room));
  let reading = $derived(roomReading(room, rads));
  let rc = $derived(roomControls(rads));
  let readonly = $derived(rc.controllable === 0);
  let offline = $derived(status.kind === 'offline');
  let heating = $derived(!offline && status.kind !== 'off' && status.kind !== 'window' && house.roomHeating(room.id));
  let program = $derived(sharedProgram(rads) ?? rads[0]?.program ?? null);
  let pending = $derived(house.pendingFor(room.radiator_ids));
  let inFlight = $derived(pending?.status === 'sending' || pending?.status === 'pending');
  let p = $derived(readonly ? null : primarySetpoint(status, rads, override, expected, inFlight));
  // Programme in an Éco period: −/+ sets Confort, which applies at the next comfort slot.
  let waitAt = $derived(p?.waiting ? nextComfortAt(program, now) : null);
  let line = $derived(tileLine(status, heating, override, program, now, layout === 'tile'));
  let variant = $derived<'normal' | 'off' | 'absence' | 'readonly' | 'offline'>(
    offline ? 'offline' : readonly ? 'readonly' : status.kind === 'off' ? 'off' : status.kind === 'away' ? 'absence' : 'normal'
  );
  let note = $derived(
    variant === 'off'
      ? layout === 'tile'
        ? m.maison.offNoteShort
        : m.maison.offNote
      : variant === 'absence' && override?.kind === 'away'
        ? override.ends_at == null
          ? m.maison.awayUntilReturn
          : m.maison.awayUntil(fmtWeekdayTime(override.ends_at * 1000))
        : undefined
  );
  // One sentence for screen readers (the tile body is one link): name, reading, status, consigne, en chauffe.
  let label = $derived(
    (offline
      ? [name, status.text, status.hint ?? '']
      : [
          name,
          fmtTemp(reading),
          status.text,
          status.target == null ? '' : m.room.target(fmtTemp(status.target)),
          heating ? m.room.heatingNow : '',
          status.someOffline ? m.status.someOffline(status.someOffline.k, status.someOffline.n) : ''
        ]
    )
      .filter(Boolean)
      .join(', ')
  );
  let setpoint = $derived(status.kind === 'off' ? null : points.map((x) => ({ t: x.t, v: x.s })));
  let bands = $derived(
    status.kind === 'comfort' || status.kind === 'eco' ? comfortBands(program ?? {}, start, end).map((s) => ({ from: s.start, to: s.end })) : []
  );
</script>

{#snippet stepper()}{#if p}<Stepper size={layout === 'tile' ? 'sm' : 'md'} block caption={primaryLabel(p.kind)}
    label={`${name} · ${primaryLabel(p.kind)}`} value={p.value} min={p.min} max={p.max} pending={p.pending} disabled={!house.online}
    announce={false} format={layout === 'tile' ? (v) => fmtTempShort(v) : undefined}
    onchange={(v) => run(() => sendPrimary(room.id, p!, v, Date.now()))} />{#if p.waiting}<p class="wait">{#if layout === 'tile'}{m.maison.waitShort(waitAt == null ? null : fmtTime(waitAt))}{:else}{m.roomSheet.waitComfort(waitAt == null ? null : fmtTime(waitAt))}{#if rc.boost > 0}{' · '}<a
          href={roomSheetHref(ROUTES.rooms, room.id, { boost: true })}>{m.roomSheet.heatNow}</a>{/if}{/if}</p>{/if}{/if}{/snippet}
{#snippet pendingTag()}<PendingTag {pending} radiators={room.radiator_ids} onretry={retry} ondismiss={(id) => house.dismiss(id)} />{/snippet}
{#snippet sparkLine()}<MiniSpark points={points.map((x) => ({ t: x.t, v: x.v }))} {setpoint} {bands} {start} {end} {now} dim={variant !== 'normal'} />{/snippet}

<!-- Opening the sheet keeps the tableau's scroll and the tile's focus (the sheet gives it back on close); only the
     room links do: every other link on Maison lands at the top of its page. -->
<div class="keep" data-sveltekit-noscroll data-sveltekit-keepfocus>
<RoomTile {name} href={ROUTES.room(room.id)} ariaLabel={label} {reading} lead={line.lead} tone={line.tone} rest={line.rest}
  pending={status.pending} {heating} {variant} {layout} {note} hint={status.hint} chip={readonly ? m.support.readonly : undefined}
  glyph={variant === 'off' ? 'power' : undefined} dipKey={reading} class={cls}
  control={p && variant === 'normal' ? stepper : undefined} tag={pending ? pendingTag : undefined}
  spark={layout === 'widget' && !offline ? sparkLine : undefined} />
</div>

<style>
  .keep {
    display: contents;
  }
  .wait {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.35;
    color: var(--mu);
    text-align: center;
  }
  .wait a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>
