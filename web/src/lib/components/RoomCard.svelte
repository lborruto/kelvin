<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import type { Room } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { activityKey, dutyText } from '$lib/activity';
  import { fmtTemp } from '$lib/format';
  import { levelLabel, m, modeLabel } from '$lib/i18n';
  import { heatColor } from '$lib/heat';
  import { dur, easeOut, flash, T } from '$lib/motion';
  import { Settle } from '$lib/settle.svelte';
  import { fmtNextChange, nextChange } from '$lib/program';
  import { ROUTES } from '$lib/paths';
  import { agg } from '$lib/room';
  import { house } from '$lib/stores/house.svelte';
  import { roomActivity, roomsDuty } from '$lib/stores/roomdata.svelte';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import Icon from './Icon.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import OverrideBadge from './OverrideBadge.svelte';
  import PendingEdge from './PendingEdge.svelte';
  import PendingTag from './PendingTag.svelte';
  import Stepper from './Stepper.svelte';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    room: Room;
    now: number;
    expanded: boolean;
    points: StripPoint[];
    onselect: () => void;
    /** Desktop: the card is a link to the room (its inspector); phone: a button that expands it. */
    navigates?: boolean;
    /** False for the card opened by default: it is simply there, not slid open under the cards below it. */
    animate?: boolean;
    /** The room shown in the inspector (desktop). */
    selected?: boolean;
    /** This card's room is the page's URL (a room page, not "/"). */
    current?: boolean;
  }
  let { room, now, expanded, points, onselect, navigates = false, animate = true, selected = false, current = false }: Props = $props();
  const uid = $props.id();
  // The phone card's figure becomes the room page's figure (a shared-element view transition).
  // Named by the room's position, which is unique whatever characters its id holds.
  let vtName = $derived(navigates ? undefined : `temp-${house.rooms.findIndex((r) => r.id === room.id)}`);

  let radiators = $derived(house.roomRadiators(room.id));
  let unreachable = $derived(radiators.some((r) => r.reachable === false));
  let first = $derived(radiators[0]);
  let expected = $derived(house.roomExpected(room.id));
  let pending = $derived(house.pendingFor(room.radiator_ids));
  let override = $derived(house.overrideFor(room.id));
  let mode = $derived(expected.mode ?? room.mode);
  let maxT = $derived(Math.min(...radiators.map((r) => r.max_temperature), 28));
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  let change = $derived(mode === 'program' && first ? nextChange(first.program, now) : null);
  let heating = $derived(house.roomHeating(room.id));
  let actKey = $derived(activityKey(room.id, start, Math.min(end, now)));
  $effect(() => {
    const [id, a, z] = [room.id, Math.floor(start / 1000), Math.floor(Math.min(end, now) / 1000)];
    roomActivity.load(actKey, () => api.roomActivity(id, a, z));
    roomsDuty.load('all', () => api.roomsDuty());
  });
  let activity = $derived(roomActivity.data[actKey]?.value ?? null);
  let dutyEntry = $derived(roomsDuty.data.all);
  let duty = $derived(dutyEntry?.value?.rooms[room.id]?.duty ?? null);
  // Radiators that disagree leave the room value null: step from their mean, as the inspector does.
  let aTarget = $derived(agg(radiators.map((r) => r.target)));
  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let level = $derived(room.mode === 'off' ? null : room.heating_level);
  // The comfort asked for, underlined dashed on the setpoint until the radiators report it.
  const comfortSettle = new Settle<number>(() => expected.comfort ?? null, () => aComfort.value);
  // After the answer, the requested value stays only if the radiators confirmed it.
  let shownComfort = $derived(
    mode === 'program' ? (expected.comfort ?? (comfortSettle.confirmed ? comfortSettle.held?.v : undefined)) : undefined
  );

  const setMode = (next: 'off' | 'manual' | 'program') => run(() => api.roomMode(room.id, next));
  const setTarget = (v: number) => run(() => api.roomSetpoint(room.id, 'manual', v));
  const setComfort = (v: number) => run(() => api.roomSetpoint(room.id, 'comfort', v));
</script>

{#snippet headInner()}
  <span class="name">{room.name}{#if !navigates}<span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>{/if}</span>
  <span class="chips">
    <span class="chip">{modeLabel(mode)}</span>
    {#if level && level !== 'mixed' && levelLabel(level)}<span class="chip level">{levelLabel(level)}</span>{/if}
    {#if room.window_open}<span class="chip warn"><Icon name="window" size={12} />{m.room.windowOpen}</span>{/if}
    {#if unreachable}<span class="chip warn"><Icon name="alert" size={12} />{m.roomInfo.unreachableChip}</span>{/if}
    <OverrideBadge {override} />
    {#if heating && mode !== 'off'}<span class="chip heat">{m.room.heatingNow}</span>{/if}
  </span>
  <span class="temp num" style:view-transition-name={vtName}>{#key room.temperature}<span class="fig" style:color={heatColor(room.temperature)}
      in:flash>{fmtTemp(room.temperature)}</span>{/key}</span>
  <span class="setpoint num muted">
    {#if mode === 'off'}{m.room.off}{:else if shownComfort !== undefined}<span class="pending-sp">→ {fmtTemp(shownComfort)}<PendingEdge
          pending={expected.comfort !== undefined} confirmed={comfortSettle.confirmed} /></span>{:else}→ {fmtTemp(expected.target ?? room.effective_setpoint)}{/if}
  </span>
{/snippet}

<article class="card" class:expanded class:selected class:link={navigates}>
  {#if navigates}
    <a class="head" href={ROUTES.room(room.id)} aria-current={current ? 'page' : undefined} data-sveltekit-keepfocus
      data-sveltekit-noscroll>{@render headInner()}</a>
  {:else}
    <button type="button" class="head" aria-expanded={expanded} aria-controls="{uid}-controls" onclick={onselect}>{@render headInner()}</button>
  {/if}

  <ThermalStrip {points} {start} {end} {now} program={first?.program} mode={room.mode} comfort={room.comfort}
    eco={room.eco} target={room.target} pendingTarget={expected.target ?? null} pendingComfort={expected.comfort ?? null}
    axis={expanded} label={m.room.todayLabel(room.name)} {activity} />

  <div class="foot">
    <!-- The duty line's room is reserved from the first paint: a skeleton of its size until /rooms/duty answers. -->
    <span class="muted next">{#if change}{fmtNextChange(change, now)}{/if}{#if dutyEntry}<span
        title={m.room.dutyHint}>{change ? ' · ' : ''}{dutyText(duty)}</span>{:else}<span aria-hidden="true">{change ? ' · ' : ''}<span
          class="skeleton duty-sk"></span></span>{/if}</span>
    <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
    {#if expanded}<a class="details" href={ROUTES.room(room.id)} in:fade={{ duration: dur(T.state) }}>{m.room.details}<Icon name="chevron" size={14} /></a>{/if}
  </div>

  {#if expanded}
    <div class="controls" id="{uid}-controls" transition:slide={{ duration: animate ? dur(T.enter) : 0, easing: easeOut }}>
      <ModeSwitch value={room.mode} pending={expected.mode ?? null} compact disabled={!house.online} onchange={setMode} />
      {#if mode === 'manual'}
        <div class="row"><span class="label">{m.room.setpoint}{#if aTarget.mixed && expected.target === undefined}<span class="note">{m.room.mixedMean}</span>{/if}</span>
          <Stepper label={m.room.setpoint} announce={false} value={expected.target ?? aTarget.value} min={7} max={maxT} disabled={!house.online}
            pending={expected.target !== undefined} onchange={setTarget} /></div>
      {:else if mode === 'program'}
        <div class="row"><span class="label">{m.room.comfort}{#if aComfort.mixed && expected.comfort === undefined}<span class="note">{m.room.mixedMean}</span>{/if}</span>
          <Stepper label={m.room.comfort} announce={false} value={expected.comfort ?? aComfort.value} min={12} max={maxT} disabled={!house.online}
            pending={expected.comfort !== undefined} onchange={setComfort} /></div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .card {
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: grid;
    gap: 8px;
    transition:
      border-color var(--t-state) ease,
      background-color var(--t-press) ease;
  }
  /* The card answers the pointer: a firmer edge on hover, a tone deeper while pressed. */
  @media (hover: hover) {
    .card:has(.head:hover) {
      border-color: color-mix(in srgb, var(--line) 50%, var(--mu));
    }
  }
  .card:has(.head:active) {
    background: color-mix(in srgb, var(--s1) 60%, var(--s2));
  }
  /* The room in the inspector (desktop). */
  .card.selected {
    border-color: var(--mu);
  }
  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'name temp' 'chips setpoint';
    align-items: baseline;
    gap: 2px 12px;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    border-radius: 6px;
  }
  .name {
    grid-area: name;
    font-weight: 600;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .chev {
    display: inline-flex;
    vertical-align: -2px;
    margin-left: 6px;
    color: var(--mu);
    transform: rotate(90deg);
    transition: transform var(--t-state) var(--ease-out);
  }
  .expanded .chev {
    transform: rotate(-90deg);
  }
  .chips {
    grid-area: chips;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 1px 6px;
  }
  .chip.warn {
    color: var(--bad);
  }
  /* Warm is the heating hue (DESIGN: blue and orange only for heat). */
  .chip.heat {
    color: var(--warm);
    border-color: color-mix(in srgb, var(--warm) 40%, var(--line));
  }
  .temp {
    grid-area: temp;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-align: right;
  }
  .fig {
    display: inline-block;
  }
  .setpoint {
    grid-area: setpoint;
    font-size: 13px;
    text-align: right;
    white-space: nowrap;
  }
  .pending-sp {
    position: relative;
    display: inline-block;
    padding-bottom: 2px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    font-size: 13px;
  }
  .next {
    flex: 1;
    min-width: 0;
  }
  /* About the width of « chauffe 14 % sur 24 h » at the line's height, so the text lands in place. */
  .duty-sk {
    display: inline-block;
    width: 20ch;
    max-width: 100%;
    height: 1em;
    vertical-align: -0.15em;
  }
  /* The 44 px link target spills into the gaps around the row instead of adding height. */
  .expanded .foot {
    margin-block: -12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .label {
    font-size: 14px;
  }
  .note {
    display: block;
    font-size: 12px;
    color: var(--mu);
  }
  .controls {
    display: grid;
    gap: 10px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }
  .details {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    padding-left: 8px;
    font-size: 13px;
    color: var(--mu);
    text-decoration: none;
    transition: color var(--t-state) ease;
  }
  .details:hover {
    color: var(--tx);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
