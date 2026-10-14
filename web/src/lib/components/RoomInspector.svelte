<script lang="ts">
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtDelta, fmtTemp, fmtTime, LEVEL_LABEL } from '$lib/format';
  import { heatColor } from '$lib/heat';
  import { fmtNextChange, nextChange } from '$lib/program';
  import { history } from '$lib/stores/history.svelte';
  import { agg } from '$lib/room';
  import { house } from '$lib/stores/house.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import ModeSwitch from './ModeSwitch.svelte';
  import OverrideBadge from './OverrideBadge.svelte';
  import PendingTag from './PendingTag.svelte';
  import RadiatorPanel from './RadiatorPanel.svelte';
  import Segmented from './Segmented.svelte';
  import Stepper from './Stepper.svelte';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    roomId: string;
  }
  let { roomId }: Props = $props();

  const RANGES = { day: { label: '24 h', days: 1, step: 900 }, week: { label: '7 j', days: 7, step: 3600 }, month: { label: '30 j', days: 30, step: 21600 } };
  type RangeKey = keyof typeof RANGES;
  const RANGE_OPTIONS = (Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: RANGES[k].label }));

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

  const boost = () => run(() => api.roomBoost(roomId, boostTemp, boostHours * 60));
</script>

{#if !room}
  <p class="muted">Pièce introuvable.</p>
{:else}
  <div class="inspector">
    <header>
      <div>
        <h2>{room.name}</h2>
        <p class="muted">
          {radiators.length} radiateur{radiators.length > 1 ? 's' : ''}
          {#if room.heating_level && LEVEL_LABEL[room.heating_level]} · {LEVEL_LABEL[room.heating_level]}{/if}
          {#if mode === 'program' && !sameProgram} · Programmes différents selon les radiateurs{:else if change} · <span class="nowrap">{fmtNextChange(change, now)}</span>{/if}
        </p>
      </div>
      <span class="temp num" style:color={heatColor(room.temperature)}>{fmtTemp(room.temperature)}</span>
    </header>
    {#if override || pending}
      <div class="status"><OverrideBadge {override} /><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>
    {/if}

    <section>
      <h3>Commande</h3>
      <ModeSwitch label="Mode de la pièce" value={room.mode} pending={expected.mode ?? null} onchange={(m) => run(() => api.roomMode(roomId, m))} />
      {#if room.mode === 'mixed'}<p class="note">Mixte — les radiateurs n’ont pas le même mode</p>{/if}
      {#if mode === 'manual'}
        <div class="row"><span>Consigne</span>
          <Stepper label="Consigne" value={expected.target ?? aTarget.value} min={7} max={maxT}
            pending={expected.target !== undefined} onchange={(v) => run(() => api.roomSetpoint(roomId, 'manual', v))} />
          {#if aTarget.mixed && expected.target === undefined}<p class="note">Mixte (moyenne)</p>{/if}
        </div>
      {/if}
      {#if mode !== 'off'}
        <div class="row"><span>Confort</span>
          <Stepper label="Confort" value={expected.comfort ?? aComfort.value} min={12} max={maxT}
            pending={expected.comfort !== undefined} onchange={(v) => run(() => api.roomSetpoint(roomId, 'comfort', v))} />
          {#if aComfort.mixed && expected.comfort === undefined}<p class="note">Mixte (moyenne)</p>{/if}
        </div>
        <div class="row"><span>Abaissement éco</span>
          <Stepper label="Abaissement éco" value={expected.eco_delta ?? aEco.value} min={1} max={8}
            format={(v) => fmtDelta(v)} pending={expected.eco_delta !== undefined}
            onchange={(v) => run(() => api.roomSetpoint(roomId, 'eco', v))} />
          {#if aEco.mixed && expected.eco_delta === undefined}<p class="note">Mixte (moyenne)</p>{/if}
        </div>
      {/if}
    </section>

    <section>
      <h3>Forcer temporairement</h3>
      {#if override?.kind === 'boost'}
        <p>Forcé à {fmtTemp(override.temperature)} jusqu’à {fmtTime(override.ends_at * 1000)}.</p>
        <button type="button" class="secondary" onclick={() => run(() => api.cancelOverride(override!.id))}>Annuler le forçage</button>
      {:else}
        <div class="row">
          <Stepper label="Température forcée" value={boostTemp} min={7} max={maxT} debounceMs={0} onchange={(v) => (boostTemp = v)} />
          <label class="dur"><span class="muted">Durée</span>
            <select bind:value={boostHours}>
              <option value={1}>1 h</option><option value={2}>2 h</option><option value={4}>4 h</option><option value={8}>8 h</option>
            </select>
          </label>
          <button type="button" class="primary" disabled={busy} onclick={boost}>Forcer</button>
        </div>
      {/if}
    </section>

    <section>
      <div class="hist-head">
        <h3>Historique</h3>
        <Segmented options={RANGE_OPTIONS} value={range} label="Période" onchange={(v) => (range = v)} />
      </div>
      <ThermalStrip points={history.data[key] ?? []} {start} {end} {now} program={first?.program} mode={room.mode}
        comfort={room.comfort} eco={room.eco} target={room.target} height={120}
        pendingTarget={range === 'day' ? (expected.target ?? null) : null}
        pendingComfort={range === 'day' ? (expected.comfort ?? null) : null} axis={range === 'day'}
        label="{room.name}, température sur {RANGES[range].label}" />
    </section>

    <section>
      <h3>Radiateurs</h3>
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
  h2 {
    margin: 0;
    font-size: 20px;
  }
  header p {
    margin: 2px 0 0;
    font-size: 13px;
  }
  .temp {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
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
  select {
    min-height: 44px;
    padding: 0 10px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 8px; /* every input and select: DESIGN.md form fields */
  }
  .primary,
  .secondary {
    min-height: 44px;
    padding: 0 16px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    font-weight: 600;
    cursor: pointer;
  }
  .primary {
    background: var(--tx);
    color: var(--bg);
  }
  .secondary {
    background: var(--s2);
    justify-self: start;
  }
  .hist-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .rads {
    display: grid;
  }
</style>
