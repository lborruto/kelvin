<script lang="ts">
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtDelta, fmtTemp, fmtTime } from '$lib/format';
  import { levelLabel, m } from '$lib/i18n';
  import { heatColor } from '$lib/heat';
  import { flash } from '$lib/motion';
  import { fmtNextChange, nextChange } from '$lib/program';
  import { history } from '$lib/stores/history.svelte';
  import { agg } from '$lib/room';
  import { house } from '$lib/stores/house.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import ModeSwitch from './ModeSwitch.svelte';
  import OverrideBadge from './OverrideBadge.svelte';
  import PendingTag from './PendingTag.svelte';
  import RadiatorPanel from './RadiatorPanel.svelte';
  import RoomFigures from './RoomFigures.svelte';
  import Segmented from './Segmented.svelte';
  import Stepper from './Stepper.svelte';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    roomId: string;
    /** h1 on the phone room page (it is the page's title); h2 in the desktop inspector. */
    level?: 'h1' | 'h2';
  }
  let { roomId, level = 'h2' }: Props = $props();
  // On the phone room page the figure arrives from the card it was tapped on (view transition).
  let vtName = $derived(level === 'h1' ? `temp-${house.rooms.findIndex((r) => r.id === roomId)}` : undefined);

  const RANGES = { day: { days: 1, step: 900 }, week: { days: 7, step: 3600 }, month: { days: 30, step: 21600 } };
  type RangeKey = keyof typeof RANGES;
  // Labels are read in the template's language, never frozen here.
  let rangeOptions = $derived((Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: m.range[k] })));

  let range = $state<RangeKey>('day');
  let boostTemp = $state(21);
  let boostHours = $state(2);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  let room = $derived(house.room(roomId));
  let radiators = $derived(house.roomRadiators(roomId));
  let first = $derived(radiators[0]);
  let expected = $derived(house.roomExpected(roomId));
  let pending = $derived(room ? house.pendingFor(room.radiator_ids) : undefined);
  let override = $derived(house.overrideFor(roomId));
  let mode = $derived(expected.mode ?? room?.mode ?? null);
  let maxT = $derived(Math.min(...radiators.map((r) => r.max_temperature), 28));
  let end = $derived(range === 'day' ? addParisDays(parisMidnight(now), 1) : now);
  let start = $derived(range === 'day' ? parisMidnight(now) : now - RANGES[range].days * 86_400_000);
  let key = $derived(`${roomId}|${range}|${range === 'day' ? start : Math.floor(now / 3_600_000)}`);
  const stable = (o: unknown): string =>
    JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  let sameProgram = $derived(radiators.every((r) => stable(r.program) === stable(first?.program)));
  let change = $derived(mode === 'program' && first && sameProgram ? nextChange(first.program, now) : null);

  let aTarget = $derived(agg(radiators.map((r) => r.target)));
  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let aEco = $derived(agg(radiators.map((r) => r.eco_delta)));
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');

  $effect(() => {
    if (room) history.load(key, room.radiator_ids, start, Math.min(end, now), RANGES[range].step);
  });

  const boost = () => !busy && house.online && run(() => api.roomBoost(roomId, boostTemp, boostHours * 60));
</script>

{#if !house.loaded}
  <!-- The shape of the inspector until the house is known: never « Pièce introuvable » before data. -->
  <div class="inspector" aria-hidden="true">
    <div class="sk-head"><div class="skeleton" class:inset={level === 'h2'} style:height="26px" style:width="45%"></div>
      <div class="skeleton" class:inset={level === 'h2'} style:height="38px" style:width="6.5rem"></div></div>
    {#each [150, 96, 150] as h, i (i)}<div class="skeleton" class:inset={level === 'h2'} style:height="{h}px"></div>{/each}
  </div>
{:else if !room}
  <p class="muted">{m.room.notFound}</p>
{:else}
  <div class="inspector">
    <header>
      <div class="title">
        <svelte:element this={level} class="name">{room.name}</svelte:element>
        <p class="muted">
          {m.room.radiatorCount(radiators.length)}
          {#if levelLabel(room.heating_level)} · {levelLabel(room.heating_level)}{/if}
          {#if mode === 'program' && !sameProgram} · {m.room.programsDiffer}{:else if change} · <span class="nowrap">{fmtNextChange(change, now)}</span>{/if}
        </p>
      </div>
      <span class="temp num" style:view-transition-name={vtName}>{#key room.temperature}<span class="fig"
          style:color={heatColor(room.temperature)} in:flash>{fmtTemp(room.temperature)}</span>{/key}</span>
    </header>
    {#if override || pending}
      <div class="status"><OverrideBadge {override} /><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>
    {/if}

    <section>
      <h3>{m.room.controls}</h3>
      <ModeSwitch label={m.room.modeLabel} disabled={!house.online} value={room.mode} pending={expected.mode ?? null} onchange={(next) => run(() => api.roomMode(roomId, next))} />
      {#if room.mode === 'mixed'}<p class="note">{m.room.mixedMode}</p>{/if}
      {#if mode === 'manual'}
        <div class="row"><span>{m.room.setpoint}</span>
          <Stepper label={m.room.setpoint} announce={false} value={expected.target ?? aTarget.value} min={7} max={maxT}
            disabled={!house.online} pending={expected.target !== undefined}
            onchange={(v) => run(() => api.roomSetpoint(roomId, 'manual', v))} />
          {#if aTarget.mixed && expected.target === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
        </div>
      {/if}
      {#if mode !== 'off'}
        <div class="row"><span>{m.room.comfort}</span>
          <Stepper label={m.room.comfort} announce={false} value={expected.comfort ?? aComfort.value} min={12} max={maxT} disabled={!house.online}
            pending={expected.comfort !== undefined} onchange={(v) => run(() => api.roomSetpoint(roomId, 'comfort', v))} />
          {#if aComfort.mixed && expected.comfort === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
        </div>
        <div class="row"><span>{m.room.eco}</span>
          <Stepper label={m.room.eco} announce={false} value={expected.eco_delta ?? aEco.value} min={1} max={8}
            format={(v) => fmtDelta(v)} pending={expected.eco_delta !== undefined} disabled={!house.online}
            onchange={(v) => run(() => api.roomSetpoint(roomId, 'eco', v))} />
          {#if aEco.mixed && expected.eco_delta === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
        </div>
      {/if}
    </section>

    <section>
      <h3>{m.room.boostTitle}</h3>
      {#if override?.kind === 'boost'}
        <p>{m.room.boostActive(fmtTemp(override.temperature), fmtTime(override.ends_at * 1000))}</p>
        <button type="button" class="btn secondary" aria-disabled={!house.online}
          onclick={() => house.online && run(() => api.cancelOverride(override!.id))}>{m.room.cancelBoost}</button>
      {:else}
        <div class="row">
          <Stepper label={m.room.boostTemp} value={boostTemp} min={7} max={maxT} debounceMs={0} onchange={(v) => (boostTemp = v)} />
          <label class="dur"><span class="muted">{m.room.duration}</span>
            <select bind:value={boostHours}>
              <option value={1}>1 h</option><option value={2}>2 h</option><option value={4}>4 h</option><option value={8}>8 h</option>
            </select>
          </label>
          <button type="button" class="btn btn-primary" aria-disabled={busy || !house.online} onclick={boost}>{m.room.boost}</button>
        </div>
      {/if}
    </section>

    <section>
      <div class="hist-head">
        <h3>{m.room.history}</h3>
        <Segmented options={rangeOptions} value={range} label={m.room.range} onchange={(v) => (range = v)} />
      </div>
      <ThermalStrip points={history.data[key] ?? []} {start} {end} {now} program={first?.program} mode={room.mode}
        comfort={room.comfort} eco={room.eco} target={room.target} height={120}
        pendingTarget={range === 'day' ? (expected.target ?? null) : null}
        pendingComfort={range === 'day' ? (expected.comfort ?? null) : null} axis={range === 'day'}
        label={m.room.historyLabel(room.name, m.range[range])} />
      <RoomFigures {roomId} days={RANGES[range].days} {now} rangeLabel={m.range[range]} />
    </section>

    <section>
      <h3>{m.room.radiators}</h3>
      <div class="rads">
        {#each radiators as r (r.id)}<RadiatorPanel radiator={r} showControls={radiators.length > 1} />{/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .inspector {
    display: grid;
    gap: 18px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .title {
    min-width: 0;
  }
  .name {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  /* The phone room page: the room is the page title (Headline). */
  h1.name {
    font-size: 22px;
    letter-spacing: -0.01em;
  }
  header p {
    margin: 2px 0 0;
    font-size: 13px;
  }
  .temp {
    flex: none;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .fig {
    display: inline-block;
  }
  .sk-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .status {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    min-height: 20px;
  }
  .nowrap {
    white-space: nowrap;
  }
  section {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  /* A wrapped row keeps its stepper on the right, like the rows that fit. */
  .row > span {
    flex: 1 1 8rem;
  }
  .row > span + :global(.stepper) {
    margin-left: auto;
  }
  .secondary {
    justify-self: start;
  }
  .hist-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    margin: 0;
    flex-basis: 100%;
    font-size: 12px;
    color: var(--mu);
  }
  .dur {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .rads {
    display: grid;
  }
</style>
