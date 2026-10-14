<script lang="ts">
  import type { Room } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtTemp, LEVEL_LABEL, MODE_LABEL } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { fmtNextChange, nextChange } from '$lib/program';
  import { agg } from '$lib/room';
  import { house } from '$lib/stores/house.svelte';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import Icon from './Icon.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import OverrideBadge from './OverrideBadge.svelte';
  import PendingTag from './PendingTag.svelte';
  import Stepper from './Stepper.svelte';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    room: Room;
    now: number;
    expanded: boolean;
    points: StripPoint[];
    onselect: () => void;
    navigates?: boolean;
  }
  let { room, now, expanded, points, onselect, navigates = false }: Props = $props();

  let radiators = $derived(house.roomRadiators(room.id));
  let first = $derived(radiators[0]);
  let expected = $derived(house.roomExpected(room.id));
  let pending = $derived(house.pendingFor(room.radiator_ids));
  let override = $derived(house.overrideFor(room.id));
  let mode = $derived(expected.mode ?? room.mode);
  let maxT = $derived(Math.min(...radiators.map((r) => r.max_temperature), 28));
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  let change = $derived(mode === 'program' && first ? nextChange(first.program, now) : null);
  // Radiators that disagree leave the room value null: step from their mean, as the inspector does.
  let aTarget = $derived(agg(radiators.map((r) => r.target)));
  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let level = $derived(room.mode === 'off' ? null : room.heating_level);

  const setMode = (m: 'off' | 'manual' | 'program') => run(() => api.roomMode(room.id, m));
  const setTarget = (v: number) => run(() => api.roomSetpoint(room.id, 'manual', v));
  const setComfort = (v: number) => run(() => api.roomSetpoint(room.id, 'comfort', v));
</script>

<article class="card" class:expanded>
  <button type="button" class="head" aria-expanded={navigates ? undefined : expanded} onclick={onselect}>
    <span class="name">{room.name}</span>
    <span class="chips">
      <span class="chip">{MODE_LABEL[mode ?? 'other']}</span>
      {#if level && level !== 'mixed' && LEVEL_LABEL[level]}<span class="chip level">{LEVEL_LABEL[level]}</span>{/if}
      {#if room.window_open}<span class="chip warn"><Icon name="window" size={12} />Fenêtre ouverte</span>{/if}
      <OverrideBadge {override} />
    </span>
    <span class="temp num" style:color={heatColor(room.temperature)}>{fmtTemp(room.temperature)}</span>
    <span class="setpoint num muted">
      {#if mode === 'off'}Arrêté{:else if mode === 'program' && expected.comfort !== undefined}<span class="pending-sp">→ {fmtTemp(expected.comfort)}</span>{:else}→ {fmtTemp(expected.target ?? room.effective_setpoint)}{/if}
    </span>
  </button>

  <ThermalStrip {points} {start} {end} {now} program={first?.program} mode={room.mode} comfort={room.comfort}
    eco={room.eco} target={room.target} pendingTarget={expected.target ?? null} pendingComfort={expected.comfort ?? null}
    axis={expanded} label="{room.name}, température d’aujourd’hui" />

  {#if change || pending || expanded}
    <div class="foot">
      <span class="muted next">{#if change}{fmtNextChange(change, now)}{/if}</span>
      <PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />
      {#if expanded}<a class="details" href="/pieces/{room.id}">Détails<Icon name="chevron" size={14} /></a>{/if}
    </div>
  {/if}

  {#if expanded}
    <div class="controls">
      <ModeSwitch value={room.mode} pending={expected.mode ?? null} compact onchange={setMode} />
      {#if mode === 'manual'}
        <div class="row"><span class="label">Consigne{#if aTarget.mixed && expected.target === undefined}<span class="note">Mixte (moyenne)</span>{/if}</span>
          <Stepper label="Consigne" value={expected.target ?? aTarget.value} min={7} max={maxT}
            pending={expected.target !== undefined} onchange={setTarget} /></div>
      {:else if mode === 'program'}
        <div class="row"><span class="label">Confort{#if aComfort.mixed && expected.comfort === undefined}<span class="note">Mixte (moyenne)</span>{/if}</span>
          <Stepper label="Confort" value={expected.comfort ?? aComfort.value} min={12} max={maxT}
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
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'name temp' 'chips setpoint';
    align-items: baseline;
    gap: 2px 12px;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
  }
  .name {
    grid-area: name;
    font-weight: 600;
    font-size: 15px;
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
  .temp {
    grid-area: temp;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-align: right;
  }
  .setpoint {
    grid-area: setpoint;
    font-size: 12px;
    text-align: right;
  }
  .pending-sp {
    border-bottom: 1px dashed currentColor;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    font-size: 12px;
  }
  .next {
    flex: 1;
    min-width: 0;
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
    font-size: 13px;
    color: var(--mu);
    text-decoration: none;
  }
</style>
