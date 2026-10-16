<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { activityKey } from '$lib/activity';
  import { capsOf, isReadOnly, roomControls, roomRange } from '$lib/capabilities';
  import { fmtPct, fmtTemp, fmtTime, fmtW } from '$lib/format';
  import { m, modeLabel } from '$lib/i18n';
  import { dur, easeOut, flash, T } from '$lib/motion';
  import { ROUTES } from '$lib/paths';
  import { comfortBands, fmtDuration } from '$lib/program';
  import { agg } from '$lib/room';
  import { Settle } from '$lib/settle.svelte';
  import { provenance } from '$lib/provenance';
  import { radiatorTitle, roomName, whenText as atText } from '$lib/setup';
  import { reportedKey, requestKey, roomReading, roomStatus, sharedProgram, whenAhead, whenParts } from '$lib/status';
  import { livePower } from '$lib/roomfacts';
  import { detail as tech } from '$lib/stores/detail.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { roomActivity, roomsDuty } from '$lib/stores/roomdata.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import Fig from './Fig.svelte';
  import Icon from './Icon.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import OfflineNotice from './OfflineNotice.svelte';
  import PendingEdge from './PendingEdge.svelte';
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
  const uid = $props.id();
  // On the phone room page the figure arrives from the card it was tapped on (view transition).
  let vtName = $derived(level === 'h1' ? `temp-${house.rooms.findIndex((r) => r.id === roomId)}` : undefined);

  const RANGES = { day: { days: 1, step: 900 }, week: { days: 7, step: 3600 }, month: { days: 30, step: 21600 } };
  type RangeKey = keyof typeof RANGES;
  // Labels are read in the template's language, never frozen here.
  let rangeOptions = $derived((Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: m.range[k] })));
  const HOURS = [1, 2, 4, 8];

  let range = $state<RangeKey>('day');
  let boostTemp = $state(21);
  let boostHours = $state(2);
  let boostOpen = $state(false);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  let room = $derived(house.room(roomId));
  let radiators = $derived(house.roomRadiators(roomId));
  let first = $derived(radiators[0]);
  // Plan 12: room controls reach the radiators that support them; none → the control is absent.
  let rc = $derived(roomControls(radiators));
  let canOff = $derived(radiators.some((r) => !isReadOnly(r) && capsOf(r).levels.includes('off')));
  let manualRange = $derived(roomRange(radiators, 'manual'));
  let comfortRange = $derived(roomRange(radiators, 'comfort'));
  let ecoRange = $derived(roomRange(radiators, 'eco'));
  let expected = $derived(house.roomExpected(roomId));
  let pending = $derived(room ? house.pendingFor(room.radiator_ids) : undefined);
  let override = $derived(house.overrideFor(roomId));
  let status = $derived(room ? roomStatus(room, radiators, override, expected, now) : null);
  // The request's values, not the sentence's text (a comfort change reads the same): see requestKey.
  const settle: Settle<string> = new Settle<string>(() => requestKey(expected), () => reportedKey(radiators, settle.held?.v ?? null));
  let offline = $derived(status?.kind === 'offline');
  // Controls pause while Kelvin is disconnected, and while every radiator is offline (nothing would answer).
  let paused = $derived(!house.online || offline);
  let mode = $derived(expected.mode ?? room?.mode ?? null);
  let reading = $derived(room ? roomReading(room, radiators) : null);
  // The reading's Fiche: every radiator that answers, then their mean when there are several.
  let readingRows = $derived.by(() => {
    const live = radiators.filter((r) => r.reachable !== false);
    const rows = live.map((r, i) => ({ key: r.id || String(i), label: radiatorTitle(r), value: fmtTemp(r.temperature) }));
    if (live.length > 1) rows.push({ key: 'mean', label: m.roomReading.mean, value: fmtTemp(reading) });
    if (status?.target != null) rows.push({ key: 'target', label: m.roomReading.target, value: fmtTemp(status.target) });
    return rows;
  });
  let readingProv = $derived.by(() => {
    const last = Math.max(0, ...radiators.map((r) => r.last_event_at ?? 0));
    const several = radiators.filter((r) => r.reachable !== false).length > 1;
    return provenance('cozytouch', { at: last > 0 ? last * 1000 : null, method: several ? m.roomReading.method : null }, now);
  });
  let heating = $derived(!offline && mode !== 'off' && house.roomHeating(roomId));
  // « Détails techniques » (direction-2 §1.3): the live power beside « En chauffe », its Fiche the sum's parts.
  let power = $derived(heating && tech.on ? livePower(radiators) : null);
  let powerRows = $derived(
    power
      ? [
          ...power.parts.map((p, i) => ({
            key: p.radiator.id || String(i),
            label: radiatorTitle(p.radiator),
            value: m.room.livePowerRow(fmtPct(p.rate / 100), m.roomInfo.watts(p.power))
          })),
          ...(power.parts.length > 1 ? [{ key: 'total', label: m.room.livePowerTotal, value: fmtW(power.watts) }] : [])
        ]
      : []
  );
  let powerProv = $derived(provenance('cozytouch', { nature: 'computed', method: m.room.livePowerMethod }, now));
  let maxT = $derived(Math.min(...radiators.map((r) => r.max_temperature), 28));
  let end = $derived(range === 'day' ? addParisDays(parisMidnight(now), 1) : now);
  let start = $derived(range === 'day' ? parisMidnight(now) : now - RANGES[range].days * 86_400_000);
  let key = $derived(`${roomId}|${range}|${range === 'day' ? start : Math.floor(now / 3_600_000)}`);
  let actKey = $derived(activityKey(roomId, start, Math.min(end, now)));
  // One key per midnight and quarter-hour: the share moves with the samples, at most every 5 min.
  let dutyKey = $derived(`today|${parisMidnight(now)}|${Math.floor(now / 900_000)}`);
  $effect(() => {
    if (!room) return;
    const [id, a, z] = [roomId, Math.floor(start / 1000), Math.floor(Math.min(end, now) / 1000)];
    roomActivity.load(actKey, () => api.roomActivity(id, a, z));
    // Today's share of time heating, since midnight: the window of the energy block's kWh, € and hours.
    const since = Math.floor(parisMidnight(now) / 1000);
    roomsDuty.load(dutyKey, () => api.roomsDuty(since));
  });
  let activity = $derived(roomActivity.data[actKey]?.value ?? null);
  let dutyEntry = $derived(roomsDuty.data[dutyKey]);
  let duty = $derived<number | null | 'loading' | undefined>(
    range !== 'day' ? undefined : !dutyEntry ? 'loading' : (dutyEntry.value?.rooms[roomId]?.duty ?? null)
  );

  let aTarget = $derived(agg(radiators.map((r) => r.target)));
  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let aEco = $derived(agg(radiators.map((r) => r.eco_delta)));
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');
  // Éco is shown as a temperature (comfort − lowering) and still sent as the lowering the radiators take.
  let comfortNow = $derived(expected.comfort ?? aComfort.value);
  let deltaNow = $derived(expected.eco_delta ?? aEco.value);
  let ecoNow = $derived(comfortNow != null && deltaNow != null ? comfortNow - deltaNow : null);

  $effect(() => {
    if (room) history.load(key, room.radiator_ids, start, Math.min(end, now), RANGES[range].step);
  });
  // Offline: the chart stops when the radiators went offline; a value Kelvin kept reading after that is not a reading.
  let points = $derived.by(() => {
    const all = history.data[key] ?? [];
    const since = offline ? status?.since : null;
    return since != null ? all.filter((p) => p.t <= since + 60_000) : all;
  });

  // Offline: the last reading, with its time, from the week's history up to when the radiators went
  // offline (a stale value Kelvin kept reading after that is not a reading), else what they last reported.
  let lastKey = $derived(`${roomId}|last|${Math.floor(now / 3_600_000)}`);
  $effect(() => {
    if (room && offline) history.load(lastKey, room.radiator_ids, now - 7 * 86_400_000, now, 900);
  });
  let lastReading = $derived.by(() => {
    if (!offline || !status) return null;
    const cut = status.since != null ? status.since + 60_000 : Infinity;
    const p = (history.data[lastKey] ?? []).filter((x) => x.v != null && x.t <= cut).at(-1);
    if (p) return m.room.lastReading(fmtTemp(p.v), atText(p.t, now));
    const r = radiators.find((x) => x.temperature != null && x.last_event_at != null);
    return r ? m.room.lastReading(fmtTemp(r.temperature), atText(r.last_event_at! * 1000, now)) : null;
  });
  // « Dernier mode connu : Programme · confort 20,0 °C, éco 17,0 °C. »
  let lastKnown = $derived.by(() => {
    if (!room || !offline) return null;
    const detail =
      room.mode === 'program' && room.comfort != null && room.eco != null
        ? m.strip.program(fmtTemp(room.comfort), fmtTemp(room.eco))
        : room.mode === 'manual' && room.target != null
          ? m.strip.setpoint(fmtTemp(room.target))
          : null;
    return m.room.lastKnown(detail ? `${modeLabel(room.mode)} · ${detail}` : modeLabel(room.mode));
  });

  // The chart's legend lists only what it draws.
  let legend = $derived.by(() => {
    if (!room) return [];
    const out: { k: string; label: string }[] = [];
    if (points.some((p) => p.v != null)) out.push({ k: 'temp', label: m.strip.legendTemp });
    const prog = room.mode === 'program' && room.comfort != null && room.eco != null;
    if ((room.mode === 'manual' && room.target != null) || prog) out.push({ k: 'setpoint', label: m.strip.legendSetpoint });
    if (room.mode === 'program' && comfortBands(first?.program ?? {}, start, end).length) out.push({ k: 'comfort', label: m.strip.legendComfort });
    const within = (rs: { start: number; end: number }[]) => rs.some((r) => r.end * 1000 > start && r.start * 1000 < end);
    if (activity && within(activity.window)) out.push({ k: 'window', label: m.strip.legendWindow });
    if (activity && within(activity.presence)) out.push({ k: 'presence', label: m.strip.legendPresence });
    return out;
  });

  // What follows a boost, in words: back to the programme at its end, or to the manual setpoint.
  let boostEnd = $derived(now + boostHours * 3_600_000);
  let boostThen = $derived.by(() => {
    if (mode === 'program' && sharedProgram(radiators)) {
      const w = whenParts(boostEnd, now);
      return m.boost.thenProgram(w.time, w.on);
    }
    if (mode === 'manual' && aTarget.value != null) return m.boost.thenManual(fmtTemp(expected.target ?? aTarget.value));
    if (mode === 'off') return m.boost.thenOff;
    return m.boost.then;
  });
  let durations = $derived(HOURS.map((h) => ({ h, label: fmtDuration(h * 60) })));

  // Desktop column: once the header scrolls out of the panel, a compact bar keeps the room's name and reading
  // on top. It is a zero-height sticky layer that only fades: it never moves the content (CLS).
  let headerEl = $state<HTMLElement>();
  let stuck = $state(false);
  $effect(() => {
    const el = headerEl;
    if (!el || level !== 'h2' || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 100));
    io.observe(el);
    return () => io.disconnect();
  });

  const boost = () => !busy && !paused && run(() => api.roomBoost(roomId, boostTemp, boostHours * 60));
  const setEco = (v: number) => comfortNow != null && run(() => api.roomSetpoint(roomId, 'eco', Math.round((comfortNow - v) * 2) / 2));
</script>

{#if !house.loaded}
  <!-- The shape of the inspector until the house is known: never « Pièce introuvable » before data. -->
  <div class="inspector" aria-hidden="true">
    <div class="sk-head"><div class="skeleton" class:inset={level === 'h2'} style:height="26px" style:width="45%"></div>
      <div class="skeleton" class:inset={level === 'h2'} style:height="38px" style:width="6.5rem"></div></div>
    {#each [150, 96, 150] as h, i (i)}<div class="skeleton" class:inset={level === 'h2'} style:height="{h}px"></div>{/each}
  </div>
{:else if !room || !status}
  <p class="muted">{m.room.notFound}</p>
{:else}
  {#key roomId}
  <div class="inspector" in:fade={{ duration: dur(T.state) }}>
    {#if level === 'h2'}
      <div class="mini-wrap" aria-hidden="true">
        <div class="mini" class:on={stuck}>
          <span class="mini-name">{roomName(room)}</span>
          {#if !offline}<span class="mini-temp num">{fmtTemp(reading)}</span>{:else}<span class="muted mini-st">{status.lead}</span>{/if}
        </div>
      </div>
    {/if}
    <header bind:this={headerEl}>
      <div class="title">
        <svelte:element this={level} class="name">{roomName(room)}</svelte:element>
        <p class="st" class:muted={status.tone === 'muted'}>
          <span class="sentence" class:dashed={status.pending || settle.confirmed}><span class="lead {status.tone}"
              >{#if status.kind === 'window'}<Icon name="window" size={14} />{/if}{status.lead}</span>{#if status.rest}{' · '}{status.rest}{/if}<PendingEdge
              pending={status.pending} confirmed={!status.pending && settle.confirmed} /></span>
        </p>
        {#if heating || room.presence === true || status.someOffline}
          <p class="sub">
            {#if heating}<span class="heat"><span class="dot" aria-hidden="true"></span>{m.room.heatingNow}</span>{#if power}<span class="power num"><Fig value={m.room.livePower(fmtW(power.watts))} title={m.room.livePowerTitle} rows={powerRows} provenance={powerProv} /></span>{/if}{/if}
            {#if room.presence === true}<span class="muted">{m.room.presenceDetected}</span>{/if}
            {#if status.someOffline}<span class="muted part"><Icon name="plug-off" size={14} />{m.status.someOffline(status.someOffline.k, status.someOffline.n)}</span>{/if}
          </p>
        {/if}
      </div>
      {#if !offline}
        <div class="figure">
          <!-- L1: the reading opens its Fiche (each radiator's figure, the mean, when Cozytouch last reported). -->
          <span class="temp num" style:view-transition-name={vtName}><Fig value={fmtTemp(reading)} title={m.roomReading.title(roomName(room))}
              rows={readingRows} provenance={readingProv}>{#key reading}<span class="val" in:flash>{fmtTemp(reading)}</span>{/key}</Fig></span>
          {#if status.target != null}<span class="target num muted">{m.room.target(fmtTemp(status.target))}</span>{/if}
        </div>
      {/if}
    </header>

    {#if offline}<OfflineNotice hint={status.hint ?? ''} count={radiators.length} last={lastReading} />{/if}
    {#if room.window_open && !offline}
      <div class="callout bad" role="status"><Icon name="window" size={14} /><p>{m.room.windowNotice}</p></div>
    {/if}
    {#if pending}<div class="pend"><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>{/if}

    <section aria-labelledby="{uid}-controls">
      <h3 id="{uid}-controls">{m.room.controls}</h3>
      {#if rc.controllable === 0}
        <p class="note">{m.roomCaps.readOnly}</p>
      {:else}
        {#if rc.modes.length}
          <ModeSwitch label={m.room.modeLabel} disabled={paused} value={room.mode} pending={expected.mode ?? null} modes={rc.modes}
            onchange={(next) => run(() => api.roomMode(roomId, next))} />
          {#if rc.mode < rc.total}<p class="note">{m.roomCaps.partial(rc.mode, rc.total)}</p>{/if}
        {:else if canOff}
          <!-- Pilot-wire rooms have levels, not modes: « Arrêt » is the house-off rule for this room. -->
          <button type="button" class="btn secondary" aria-pressed={mode === 'off'} aria-disabled={busy || paused}
            onclick={() => !busy && !paused && mode !== 'off' && run(() => api.roomMode(roomId, 'off'))}>{m.mode.off}</button>
        {/if}
        {#if offline}
          <p class="note">{lastKnown}</p>
        {:else}
          {#if rc.modes.length && room.mode === 'mixed'}<p class="note">{m.room.mixedMode}</p>{/if}
          {#if mode === 'manual' && manualRange}
            <div class="row"><span>{m.room.setpoint}</span>
              <Stepper label={m.room.setpoint} announce={false} value={expected.target ?? aTarget.value} min={manualRange[0]} max={manualRange[1]}
                disabled={paused} pending={expected.target !== undefined}
                onchange={(v) => run(() => api.roomSetpoint(roomId, 'manual', v))} />
              {#if aTarget.mixed && expected.target === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
              {#if rc.manual < rc.total}<p class="note">{m.roomCaps.partial(rc.manual, rc.total)}</p>{/if}
            </div>
          {/if}
          <!-- The programme's two temperatures stay at hand in every mode but Arrêt (Programme links here to edit them). -->
          {#if mode !== 'off'}
            {#if comfortRange}
              <div class="row"><span>{m.room.comfort}</span>
                <Stepper label={m.room.comfort} announce={false} value={comfortNow} min={comfortRange[0]} max={comfortRange[1]}
                  disabled={paused} pending={expected.comfort !== undefined}
                  onchange={(v) => run(() => api.roomSetpoint(roomId, 'comfort', v))} />
                {#if aComfort.mixed && expected.comfort === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
                {#if rc.comfort < rc.total}<p class="note">{m.roomCaps.partial(rc.comfort, rc.total)}</p>{/if}
              </div>
            {/if}
            {#if ecoRange && comfortNow != null}
              <div class="row"><span>{m.room.eco}{#if deltaNow != null}<small>{m.room.ecoBelow(fmtTemp(deltaNow))}</small>{/if}</span>
                <Stepper label={m.room.eco} announce={false} value={ecoNow} min={comfortNow - ecoRange[1]} max={comfortNow - ecoRange[0]}
                  pending={expected.eco_delta !== undefined} disabled={paused} onchange={setEco} />
                {#if aEco.mixed && expected.eco_delta === undefined}<p class="note">{m.room.mixedMean}</p>{/if}
                {#if rc.eco < rc.total}<p class="note">{m.roomCaps.partial(rc.eco, rc.total)}</p>{/if}
              </div>
            {/if}
            {#if rc.program > 0 && mode === 'program'}
              <a class="link" href="{ROUTES.schedule}?room={encodeURIComponent(roomId)}">{m.room.editHours}<Icon name="chevron" size={14} /></a>
            {/if}
          {/if}
        {/if}
      {/if}
    </section>

    {#if rc.boost > 0 && !offline}
      <section class="boost" aria-labelledby="{uid}-boost">
        {#if override?.kind === 'boost'}
          <h3 id="{uid}-boost">{m.boost.title}</h3>
          <div class="row">
            <p class="active num">{m.status.until(fmtTemp(override.temperature), whenAhead(override.ends_at * 1000, now))}</p>
            <button type="button" class="btn secondary" aria-disabled={paused}
              onclick={() => !paused && run(() => api.cancelOverride(override!.id))}>{m.boost.stop}</button>
          </div>
        {:else}
          <h3 class="disc-h" id="{uid}-boost">
            <button type="button" class="disc" aria-expanded={boostOpen} aria-controls="{uid}-boost-body" onclick={() => (boostOpen = !boostOpen)}>
              <span>{m.boost.title}</span>
              <span class="meta muted">{m.boost.meta(fmtTemp(boostTemp), fmtDuration(boostHours * 60))}</span>
              <span class="chev" class:open={boostOpen} aria-hidden="true"><Icon name="chevron" size={14} /></span>
            </button>
          </h3>
          {#if boostOpen}
            <div class="boost-body" id="{uid}-boost-body" transition:slide={{ duration: dur(T.enter), easing: easeOut }}>
              <div class="sentence-row">
                <span>{m.boost.heatTo}</span>
                <Stepper label={m.boost.temp} value={boostTemp} min={manualRange?.[0] ?? 7} max={manualRange?.[1] ?? maxT} debounceMs={0}
                  onchange={(v) => (boostTemp = v)} />
                <label class="dur"><span>{m.boost.during}</span>
                  <select bind:value={boostHours} aria-label={m.room.duration}>
                    {#each durations as d (d.h)}<option value={d.h}>{d.label}</option>{/each}
                  </select>
                </label>
              </div>
              <div class="row">
                <p class="note then">{boostThen}</p>
                <button type="button" class="btn btn-primary" aria-disabled={busy || paused} onclick={boost}>{m.boost.start}</button>
              </div>
              {#if rc.boost < rc.total}<p class="note">{m.roomCaps.partial(rc.boost, rc.total)}</p>{/if}
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <section aria-labelledby="{uid}-hist">
      <div class="hist-head">
        <h3 id="{uid}-hist">{range === 'day' ? m.room.today : m.room.history}</h3>
        <Segmented options={rangeOptions} value={range} label={m.room.range} onchange={(v) => (range = v)} />
      </div>
      <ThermalStrip {points} {start} {end} {now} program={first?.program} mode={room.mode}
        comfort={room.comfort} eco={room.eco} target={room.target} height={120} yAxis events
        pendingTarget={range === 'day' ? (expected.target ?? null) : null}
        pendingComfort={range === 'day' ? (expected.comfort ?? null) : null} axis={range === 'day'}
        label={m.room.historyLabel(roomName(room), m.range[range])} {activity} />
      {#if legend.length}
        <p class="legend">
          {#each legend as l (l.k)}<span class="key"><span class="sw {l.k}" aria-hidden="true"></span>{l.label}</span>{/each}
          {#if legend.some((l) => l.k === 'window' || l.k === 'presence')}<span class="muted">{m.strip.sampled}</span>{/if}
        </p>
      {/if}
    </section>

    <section>
      <RoomFigures {roomId} days={RANGES[range].days} {now} rangeLabel={m.range[range]} {duty} />
    </section>

    <section aria-labelledby="{uid}-rads">
      <h3 id="{uid}-rads">{m.room.radiators(radiators.length)}</h3>
      <div class="rads">
        {#each radiators as r (r.id)}<RadiatorPanel radiator={r} showControls={radiators.length > 1} />{/each}
      </div>
    </section>
  </div>
  {/key}
{/if}

<style>
  .inspector {
    display: grid;
    gap: 18px;
    min-width: 0;
  }
  /* The compact bar: sticky at the panel's top edge (its 16 px padding), drawn over the content, no layout of its own. */
  .mini-wrap {
    position: sticky;
    top: -16px;
    height: 0;
    margin-bottom: -18px; /* the grid gap: the bar takes no row */
    z-index: 3;
  }
  .mini {
    position: absolute;
    top: 0;
    left: -16px;
    right: -16px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 10px;
    background: var(--s1);
    border-bottom: 1px solid var(--line);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--t-state) ease,
      visibility var(--t-state) allow-discrete;
  }
  .mini.on {
    opacity: 1;
    visibility: visible;
  }
  .mini-name {
    min-width: 0;
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-temp {
    flex: none;
    font-size: 17px;
    font-weight: 600;
  }
  .mini-st {
    flex: none;
    font-size: 13px;
  }
  @media (prefers-reduced-motion: reduce) {
    .mini {
      transition: none;
    }
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .title {
    min-width: 0;
    display: grid;
    gap: 2px;
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
    margin: 0;
    font-size: 13px;
  }
  .st {
    font-size: 14px;
    line-height: 20px;
  }
  .sentence {
    position: relative;
    display: inline-block;
  }
  .sentence.dashed {
    padding-bottom: 2px;
  }
  .lead {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .lead.muted {
    color: var(--mu);
  }
  .lead.warm {
    color: var(--warm);
  }
  .lead.cool {
    color: var(--cool);
  }
  .lead.bad {
    color: var(--bad);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    font-size: 12px;
  }
  .power {
    color: var(--mu);
  }
  .heat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--warm);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warm);
  }
  .part {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .figure {
    flex: none;
    display: grid;
    justify-items: end;
  }
  .temp {
    font-size: 32px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .target {
    font-size: 13px;
  }
  .val {
    display: inline-block;
  }
  .sk-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .callout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid color-mix(in srgb, var(--bad) 60%, var(--line));
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bad) 8%, var(--s1));
    font-size: 13px;
  }
  .callout :global(svg) {
    margin-top: 3px;
    color: var(--bad);
  }
  .callout p {
    margin: 0;
  }
  .pend {
    display: flex;
    min-height: 20px;
  }
  section {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
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
  .row small {
    display: block;
    font-size: 12px;
    color: var(--mu);
  }
  .secondary {
    justify-self: start;
  }
  .link {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    font-size: 13px;
    color: var(--mu);
    text-decoration: none;
    transition: color var(--t-state) ease;
  }
  .link:hover {
    color: var(--tx);
  }
  /* « Chauffe temporaire »: a disclosure row with a title like a control, not a section label. */
  .boost {
    gap: 0;
  }
  .disc-h {
    text-transform: none;
    letter-spacing: 0;
    font-size: inherit;
    color: inherit;
  }
  .disc {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    background: none;
    border: 0;
    color: var(--tx);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .disc .meta {
    margin-left: auto;
    font-size: 12px;
    font-weight: 400;
    text-align: right;
  }
  .chev {
    display: inline-flex;
    color: var(--mu);
    transform: rotate(90deg);
    transition: transform var(--t-state) var(--ease-out);
  }
  .chev.open {
    transform: rotate(-90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .boost-body {
    display: grid;
    gap: 10px;
    padding: 6px 0 2px;
  }
  .sentence-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    font-size: 14px;
  }
  .dur {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .active {
    margin: 0;
    font-size: 14px;
  }
  .boost h3:not(.disc-h) {
    margin-bottom: 10px;
  }
  .then {
    flex: 1 1 10rem;
  }
  .hist-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 0;
    font-size: 12px;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 14px;
    height: 10px;
    border-radius: 2px;
  }
  .sw.temp {
    height: 2px;
    background: linear-gradient(90deg, var(--cool), var(--neutral), var(--warm));
  }
  .sw.setpoint {
    height: 0;
    border-top: 1px dashed var(--mu);
    border-radius: 0;
  }
  .sw.comfort {
    background: color-mix(in srgb, var(--warm) 22%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--warm) 40%, transparent);
  }
  .sw.window {
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--mu) 45%, transparent) 0 1.5px, transparent 1.5px 4px);
  }
  .sw.presence {
    background: color-mix(in srgb, var(--mu) 14%, transparent);
  }
  .note {
    margin: 0;
    flex-basis: 100%;
    font-size: 12px;
    color: var(--mu);
  }
  .rads {
    display: grid;
  }
</style>
