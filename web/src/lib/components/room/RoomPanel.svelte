<!-- A room in the room sheet (Tableau §4 « Room sheet », section 2 of the mockups). Desktop (`modal`): on the
     left, close and ⋯, the name and its state, the large setpoint flanked by −/+ (the primary control: the
     setpoint in force, decision 4) with its caption, the vertical slider (secondary, 0,5 °C steps); on the right
     the modes as circles, the status sentence, Chauffe temporaire (a launch form, or the running card with
     Arrêter), « Aujourd’hui » (the chart, the day bar, the room's figures), « Températures du programme »,
     « Radiateurs · n » and this month's kWh and €. Phone (`sheet`): the same in one column, the slider between
     −/+, the rest behind « Programme, températures, radiateurs ». States: Arrêt (no setpoint, dim slider,
     Remettre en programme), window open (a bad notice, no heat colour), offline (calm notice, last reading
     with its time, last known mode, ghost day), read-only (chips, facts, no control at all). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { retry, run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { activityKey } from '$lib/activity';
  import { capsOf, isReadOnly, roomControls, roomRange } from '$lib/capabilities';
  import { fmtDayShort, fmtEurExact, fmtKwhExact, fmtPct, fmtTemp, fmtTempShort, fmtTime, fmtW } from '$lib/format';
  import { levelLabel, m, modeLabel } from '$lib/i18n';
  import { segsText, todaySegs } from '$lib/dashboard';
  import { dur, easeOut, T } from '$lib/motion';
  import { ENERGY_ANCHORS, ROUTES } from '$lib/paths';
  import { comfortBands, fmtDuration, isComfortAt } from '$lib/program';
  import { provenance } from '$lib/provenance';
  import { agg } from '$lib/room';
  import { livePower } from '$lib/roomfacts';
  import { primaryLabel, primarySetpoint, sendPrimary } from '$lib/setpoint';
  import { Settle } from '$lib/settle.svelte';
  import { radiatorTitle, roomName, whenText as atText } from '$lib/setup';
  import { reportedKey, requestKey, roomReading, roomStatus, sharedProgram, whenAhead, whenParts } from '$lib/status';
  import { auth } from '$lib/stores/auth.svelte';
  import { detail as tech } from '$lib/stores/detail.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { roomActivity, roomEnergy, roomsDuty } from '$lib/stores/roomdata.svelte';
  import { addParisDays, parisMidnight, parisMinuteOfDay, parisParts } from '$lib/time';
  import { parisTodayIso } from '$lib/format';
  import { weather } from '$lib/stores/weather.svelte';
  import { ATTRIBUTION_URL } from '$lib/weather';
  import DayBar from '../DayBar.svelte';
  import GroupedList from '../GroupedList.svelte';
  import ListRow from '../ListRow.svelte';
  import Fig from '../Fig.svelte';
  import Icon from '../Icon.svelte';
  import Menu from '../Menu.svelte';
  import Notice from '../Notice.svelte';
  import PendingEdge from '../PendingEdge.svelte';
  import PendingTag from '../PendingTag.svelte';
  import RadiatorPanel from '../RadiatorPanel.svelte';
  import RoomFigures from '../RoomFigures.svelte';
  import Segmented from '../Segmented.svelte';
  import Stepper from '../Stepper.svelte';
  import SupportChip from '../SupportChip.svelte';
  import ThermalStrip from '../ThermalStrip.svelte';
  import VSlider from '../VSlider.svelte';
  import ModeCircles from './ModeCircles.svelte';

  interface Props {
    roomId: string;
    /** `modal`: the desktop two-column sheet; `sheet`: the phone bottom sheet. */
    layout?: 'modal' | 'sheet';
    /** Open the Chauffe temporaire form at once (the tableau's « Lancer… » tile). */
    boostFirst?: boolean;
    onclose?: () => void;
  }
  let { roomId, layout = 'modal', boostFirst = false, onclose }: Props = $props();
  const uid = $props.id();
  let phone = $derived(layout === 'sheet');

  const RANGES = { day: { days: 1, step: 900 }, week: { days: 7, step: 3600 }, month: { days: 30, step: 21600 } };
  type RangeKey = keyof typeof RANGES;
  let rangeOptions = $derived((Object.keys(RANGES) as RangeKey[]).map((k) => ({ value: k, label: m.range[k] })));
  const HOURS = [1, 2, 4, 8];

  let range = $state<RangeKey>('day');
  let boostTemp = $state(21);
  let boostHours = $state(2);
  let boostOpen = $state(untrack(() => boostFirst));
  let more = $state(untrack(() => boostFirst));
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  let room = $derived(house.room(roomId));
  let radiators = $derived(house.roomRadiators(roomId));
  let first = $derived(radiators[0]);
  let rc = $derived(roomControls(radiators));
  let readonly = $derived(rc.controllable === 0);
  let canOff = $derived(radiators.some((r) => !isReadOnly(r) && capsOf(r).levels.includes('off')));
  let comfortRange = $derived(roomRange(radiators, 'comfort'));
  let ecoRange = $derived(roomRange(radiators, 'eco'));
  let manualRange = $derived(roomRange(radiators, 'manual'));
  let expected = $derived(house.roomExpected(roomId));
  let pending = $derived(room ? house.pendingFor(room.radiator_ids) : undefined);
  let busy = $derived(pending?.status === 'sending' || pending?.status === 'pending');
  let override = $derived(house.overrideFor(roomId));
  let status = $derived(room ? roomStatus(room, radiators, override, expected, now) : null);
  const settle: Settle<string> = new Settle<string>(() => requestKey(expected), () => reportedKey(radiators, settle.held?.v ?? null));
  let offline = $derived(status?.kind === 'offline');
  let paused = $derived(!house.online || offline);
  let mode = $derived(expected.mode ?? room?.mode ?? null);
  let reading = $derived(room ? roomReading(room, radiators) : null);
  let program = $derived(sharedProgram(radiators) ?? radiators.find((r) => capsOf(r).program)?.program ?? null);
  let p = $derived(status && !readonly ? primarySetpoint(status, radiators, override, expected, busy) : null);
  let heating = $derived(!offline && mode !== 'off' && status?.kind !== 'window' && house.roomHeating(roomId));
  let name = $derived(room ? roomName(room) : '');

  // The reading's Fiche: every radiator that answers, their mean when there are several, the target.
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
  // « Détails techniques »: the live power beside « En chauffe », its Fiche the sum's parts.
  let power = $derived(heating && tech.on ? livePower(radiators) : null);
  let powerRows = $derived(
    power
      ? [
          ...power.parts.map((x, i) => ({
            key: x.radiator.id || String(i),
            label: radiatorTitle(x.radiator),
            value: m.room.livePowerRow(fmtPct(x.rate / 100), m.roomInfo.watts(x.power))
          })),
          ...(power.parts.length > 1 ? [{ key: 'total', label: m.room.livePowerTotal, value: fmtW(power.watts) }] : [])
        ]
      : []
  );
  let powerProv = $derived(provenance('cozytouch', { nature: 'computed', method: m.room.livePowerMethod }, now));
  let maxT = $derived(Math.min(...radiators.map((r) => r.max_temperature), 28));

  // The chart's window and its data (history, window/presence runs, today's share of time heating).
  let end = $derived(range === 'day' ? addParisDays(parisMidnight(now), 1) : now);
  let start = $derived(range === 'day' ? parisMidnight(now) : now - RANGES[range].days * 86_400_000);
  let key = $derived(`${roomId}|${range}|${range === 'day' ? start : Math.floor(now / 3_600_000)}`);
  let actKey = $derived(activityKey(roomId, start, Math.min(end, now)));
  let dutyKey = $derived(`today|${parisMidnight(now)}|${Math.floor(now / 900_000)}`);
  $effect(() => {
    if (!room || readonly) return;
    const [id, a, z] = [roomId, Math.floor(start / 1000), Math.floor(Math.min(end, now) / 1000)];
    roomActivity.load(actKey, () => api.roomActivity(id, a, z));
    const since = Math.floor(parisMidnight(now) / 1000);
    roomsDuty.load(dutyKey, () => api.roomsDuty(since));
  });
  let activity = $derived(roomActivity.data[actKey]?.value ?? null);
  let dutyEntry = $derived(roomsDuty.data[dutyKey]);
  let duty = $derived<number | null | 'loading' | undefined>(
    range !== 'day' ? undefined : !dutyEntry ? 'loading' : (dutyEntry.value?.rooms[roomId]?.duty ?? null)
  );
  $effect(() => {
    if (room) history.load(key, room.radiator_ids, start, Math.min(end, now), RANGES[range].step);
  });
  // Plan 14: the outdoor hours of the chart's window (one request per window, like the history); none without a place.
  let wkey = $derived(`out|${range}|${range === 'day' ? start : Math.floor(now / 3_600_000)}`);
  $effect(() => {
    if (weather.on) weather.hourly(wkey, start, Math.min(end, now));
  });
  let outdoorPoints = $derived(weather.on ? (weather.entries[wkey]?.points ?? []) : []);
  // Offline: the chart stops when the radiators went offline (a value read after that is not a reading).
  let points = $derived.by(() => {
    const all = history.data[key] ?? [];
    const since = offline ? status?.since : null;
    return since != null ? all.filter((x) => x.t <= since + 60_000) : all;
  });

  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let aEco = $derived(agg(radiators.map((r) => r.eco_delta)));
  let comfortNow = $derived(expected.comfort ?? aComfort.value);
  let deltaNow = $derived(expected.eco_delta ?? aEco.value);
  let ecoNow = $derived(comfortNow != null && deltaNow != null ? comfortNow - deltaNow : null);

  // Offline: the last reading with its time, up to when the radiators went offline.
  let lastKey = $derived(`${roomId}|last|${Math.floor(now / 3_600_000)}`);
  $effect(() => {
    if (room && offline) history.load(lastKey, room.radiator_ids, now - 7 * 86_400_000, now, 900);
  });
  let lastReading = $derived.by(() => {
    if (!offline || !status) return null;
    const cut = status.since != null ? status.since + 60_000 : Infinity;
    const x = (history.data[lastKey] ?? []).filter((y) => y.v != null && y.t <= cut).at(-1);
    if (x) return m.room.lastReading(fmtTemp(x.v), atText(x.t, now));
    const r = radiators.find((y) => y.temperature != null && y.last_event_at != null);
    return r ? m.room.lastReading(fmtTemp(r.temperature), atText(r.last_event_at! * 1000, now)) : null;
  });
  let lastKnown = $derived.by(() => {
    if (!room || !offline) return null;
    const d =
      room.mode === 'program' && room.comfort != null && room.eco != null
        ? m.strip.program(fmtTemp(room.comfort), fmtTemp(room.eco))
        : room.mode === 'manual' && room.target != null
          ? m.strip.setpoint(fmtTemp(room.target))
          : null;
    return m.room.lastKnown(d ? `${modeLabel(room.mode)} · ${d}` : modeLabel(room.mode));
  });

  // The chart reads any moment (hover, tap, ←/→): each radiator by name when the room has several, the running
  // override's span by its name, presence and window rows where a radiator detects them or reported a run.
  let inspect = $derived.by(() => {
    const names = Object.fromEntries(radiators.map((r) => [r.id, radiatorTitle(r)]));
    const ran = (k: 'window' | 'presence') => !!activity?.[k].length;
    return {
      kind: range,
      stepMs: RANGES[range].step * 1000,
      names,
      several: radiators.length > 1,
      override: override ?? null,
      presence: radiators.some((r) => r.presence_detection) || ran('presence'),
      window: radiators.some((r) => r.window_detection) || ran('window')
    };
  });

  // The legend lists only what the chart draws.
  let legend = $derived.by(() => {
    if (!room) return [];
    const out: { k: string; label: string }[] = [];
    if (points.some((x) => x.v != null)) out.push({ k: 'temp', label: m.strip.legendTemp });
    if (outdoorPoints.some((p) => p.t >= start && p.t <= now)) out.push({ k: 'outdoor', label: m.strip.legendOutdoor });
    const prog = room.mode === 'program' && room.comfort != null && room.eco != null;
    if ((room.mode === 'manual' && room.target != null) || prog) out.push({ k: 'setpoint', label: m.strip.legendSetpoint });
    if (room.mode === 'program' && comfortBands(first?.program ?? {}, start, end).length) out.push({ k: 'comfort', label: m.strip.legendComfort });
    const within = (rs: { start: number; end: number }[]) => rs.some((r) => r.end * 1000 > start && r.start * 1000 < end);
    if (activity && within(activity.window)) out.push({ k: 'window', label: m.strip.legendWindow });
    if (activity && within(activity.presence)) out.push({ k: 'presence', label: m.strip.legendPresence });
    return out;
  });

  // What follows a boost, in words.
  const thenAt = (endMs: number) => {
    if (mode === 'program' && sharedProgram(radiators)) {
      const w = whenParts(endMs, now);
      return m.boost.thenProgram(w.time, w.on);
    }
    const t = agg(radiators.map((r) => r.target)).value;
    if (mode === 'manual' && t != null) return m.boost.thenManual(fmtTemp(expected.target ?? t));
    if (mode === 'off') return m.boost.thenOff;
    return m.boost.then;
  };
  let boostThen = $derived(thenAt(now + boostHours * 3_600_000));
  let durations = $derived(HOURS.map((h) => ({ h, label: fmtDuration(h * 60) })));
  let boosting = $derived(override?.kind === 'boost');

  // The level running now (Confort / Éco in Programme, Manuel): the caption under the large figure.
  let levelNow = $derived.by(() => {
    if (p) return p.kind === 'boost' ? m.boost.title : primaryLabel(p.kind);
    if (mode === 'program' && program) return isComfortAt(program, parisParts(now).weekday, parisMinuteOfDay(now)) ? m.level.comfort : m.level.eco;
    if (mode === 'manual') return m.mode.manual;
    return status?.lead ?? '';
  });
  // The big figure when there is no −/+ (window open, absence, a restore): what the room is asked to reach.
  // An open window keeps its setpoint (paused): the level in force now, never the reading.
  let kept = $derived.by(() => {
    if (mode === 'manual') return expected.target ?? agg(radiators.map((r) => r.target)).value;
    if (mode === 'program') return levelNow === m.level.comfort ? comfortNow : ecoNow;
    return null;
  });
  let shownTarget = $derived(p ? p.value : (status?.target ?? (status?.kind === 'window' ? kept : null)));
  let caption = $derived(
    status?.kind === 'window'
      ? m.roomSheet.captionPaused(levelNow, fmtTemp(reading))
      : levelNow
        ? m.roomSheet.caption(levelNow, fmtTemp(reading))
        : m.roomSheet.now(fmtTemp(reading))
  );
  let headLead = $derived(
    !status
      ? ''
      : heating
        ? m.room.heatingNow
        : offline
          ? status.lead
          : readonly
            ? m.support.readonly
            : status.kind === 'comfort' || status.kind === 'eco'
              ? m.mode.program
              : status.lead
  );
  let headTone = $derived(heating ? 'warm' : status?.kind === 'window' ? 'bad' : status?.kind === 'away' ? 'cool' : 'tx');
  let thenLevel = $derived.by(() => {
    if (status?.kind !== 'comfort' || comfortNow == null || ecoNow == null) return '';
    return m.roomSheet.thenLevel(m.level.eco, fmtTemp(ecoNow));
  });
  let segs = $derived(todaySegs(program, now));
  let dayLabel = $derived(segs.length ? m.maison.dayBar(name, segsText(segs)) : m.maison.dayBarEmpty(name));
  let experimental = $derived(auth.server?.tier === 'experimental');

  // This month so far (today included), the room's kWh and € (the sum of its radiators' Par pièce cents).
  let dayOfMonth = $derived(Number(parisTodayIso(now).slice(8, 10)));
  let monthKey = $derived(`${roomId}|${dayOfMonth}|${Math.floor(now / 1_800_000)}`);
  $effect(() => {
    if (!room || readonly) return;
    const [id, d] = [roomId, dayOfMonth];
    roomEnergy.load(monthKey, () => api.roomEnergy(id, d));
  });
  let month = $derived(roomEnergy.data[monthKey]?.value ?? null);
  let monthProv = $derived(provenance('radiator-meter', month && (month.interpolated || month.apportioned) ? { nature: 'estimated' } : {}, now));

  let menuItems = $derived([
    ...(rc.program > 0 ? [{ label: m.room.editHours, icon: 'cal' as const, onselect: () => goto(`${ROUTES.schedule}?room=${encodeURIComponent(roomId)}`) }] : []),
    { label: m.roomSheet.energyLink, icon: 'chart' as const, onselect: () => goto(`${ROUTES.energy}#${ENERGY_ANCHORS.where}`) },
    { label: m.roomSheet.devicesLink, icon: 'grid' as const, onselect: () => goto(ROUTES.devices) }
  ]);

  const send = (v: number) => p && run(() => sendPrimary(roomId, p!, v, comfortNow, Date.now()));
  const boost = () => !busy && !paused && run(() => api.roomBoost(roomId, boostTemp, boostHours * 60));
  const setEco = (v: number) => comfortNow != null && run(() => api.roomSetpoint(roomId, 'eco', Math.round((comfortNow - v) * 2) / 2));
  function openBoost() {
    if (boosting) return;
    boostOpen = !boostOpen;
    if (boostOpen) {
      more = true;
      queueMicrotask(() => document.getElementById(`${uid}-boost`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  }
</script>

{#snippet bar()}
  <div class="bar">
    {#if phone}
      <Menu label={m.roomSheet.actions(name)} items={menuItems} />
      <div class="ttl">
        <p class="name" class:muted={offline} aria-hidden="true">{name}</p>
        {@render head()}
      </div>
      <button type="button" class="btn btn-icon round" aria-label={m.common.close} onclick={() => onclose?.()}><Icon name="x" size={18} /></button>
    {:else}
      <button type="button" class="btn btn-icon round" aria-label={m.common.close} onclick={() => onclose?.()}><Icon name="x" size={18} /></button>
      <Menu label={m.roomSheet.actions(name)} items={menuItems} />
    {/if}
  </div>
  {#if !phone}
    <p class="name big-name" class:muted={offline} aria-hidden="true">{name}</p>
    {@render head()}
  {/if}
{/snippet}

{#snippet head()}
  <p class="head"><span class="lead {headTone}">{headLead}</span>{#if !offline}{' · '}<span class="num"><Fig value={fmtTemp(reading)}
          title={m.roomReading.title(name)} rows={readingRows} provenance={readingProv} /></span>{/if}</p>
{/snippet}

{#snippet slider(h: number)}
  <VSlider value={p ? p.value : shownTarget} label={p ? m.roomSheet.setpoint(primaryLabel(p.kind)) : m.room.setpoint} min={Math.min(10, p?.min ?? 10)}
    max={Math.max(26, p?.max ?? 26)} measured={reading} dim={!p || paused} pending={p?.pending ?? false} width={phone ? 120 : 140} height={h}
    onchange={(v) => send(v)} />
{/snippet}

{#snippet hero()}
  {#if readonly}
    <p class="display num"><Fig value={fmtTempShort(reading)} title={m.roomReading.title(name)} rows={readingRows} provenance={readingProv} /></p>
    {#if radiators.length === 1}<p class="cap">{m.roomSheet.measuredBy(radiatorTitle(radiators[0]))}</p>{/if}
    <p class="chips">{#if experimental}<span class="chip">{m.support.experimental}</span>{/if}<span class="chip solid">{m.support.readonly}</span></p>
    <p class="note center">{m.roomCaps.readOnly}</p>
  {:else if offline}
    <span class="plug" aria-hidden="true"><Icon name="plug-off" size={48} /></span>
    <p class="cap">{status?.since != null ? m.roomSheet.noReading(parisMidnight(status.since) === parisMidnight(now) ? fmtTime(status.since) : m.status.onDate(fmtDayShort(status.since)), radiators.length) : m.roomSheet.noReadingUnknown}</p>
  {:else if mode === 'off' && status?.kind === 'off'}
    <p class="display off">{m.mode.off}</p>
    <p class="cap">{m.roomSheet.now(fmtTemp(reading))}</p>
    <div class="slider">{@render slider(phone ? 220 : 300)}</div>
    <p class="note center">{m.roomSheet.offNote}</p>
  {:else if p}
    {#snippet below()}<p class="cap">{caption}</p>{#if p!.kind === 'manual' && rc.manual < rc.total}<p class="note center">{m.roomCaps.partial(rc.manual, rc.total)}</p>{/if}{/snippet}
    {#snippet between()}{@render slider(phone ? (boosting || room?.window_open ? 196 : 250) : 300)}{/snippet}
    <div class="primary">
      <Stepper size="lg" label={m.roomSheet.setpoint(primaryLabel(p.kind))} value={p.value} min={p.min} max={p.max} pending={p.pending}
        disabled={!house.online} announce={false} format={(v) => fmtTempShort(v)} onchange={send} {below} between={phone ? between : undefined} />
    </div>
    {#if !phone}<div class="slider">{@render slider(320)}</div><p class="note center">{m.roomSheet.sliderNote}</p>{/if}
  {:else}
    <p class="display num" class:dimmed={status?.kind === 'window'}>{fmtTempShort(shownTarget ?? reading)}</p>
    <p class="cap">{caption}</p>
    <div class="slider">{@render slider(phone ? 220 : 300)}</div>
  {/if}
{/snippet}

{#snippet notices()}
  {#if offline}
    <Notice title={status?.hint ?? ''} icon="plug-off">
      <p>{radiators.length > 1 ? m.room.offlineBodyMany : m.room.offlineBody}</p>
      <!-- The last reading comes with the week's history: its line is held until then (CLS). -->
      {#if lastReading}<p class="num">{lastReading}</p>{:else if history.data[lastKey] === undefined}<p class="num" aria-hidden="true">&nbsp;</p>{/if}
    </Notice>
  {:else if readonly}
    <Notice title={m.roomSheet.readOnlyTitle}>{#if experimental}<p>{m.roomSheet.readOnlyExperimental}</p>{/if}</Notice>
  {:else if room?.window_open}
    <Notice title={m.room.windowNotice} tone="bad" icon="window" />
  {/if}
{/snippet}

{#snippet modes()}
  {#if !readonly}
    {#if rc.modes.length}
      <ModeCircles label={m.room.modeLabel} value={room!.mode} pending={expected.mode ?? null} modes={rc.modes} dim={paused} size={phone ? 56 : 60}
        boost={rc.boost > 0 && !offline} boostOn={boosting} boostOpen={boostOpen} boostControls="{uid}-boost"
        onchange={(next) => run(() => api.roomMode(roomId, next))} onboost={openBoost} />
      {#if rc.mode < rc.total}<p class="note">{m.roomCaps.partial(rc.mode, rc.total)}</p>{/if}
    {:else if canOff}
      <!-- Pilot-wire rooms have levels, not modes: « Arrêt » is the house-off rule for this room. -->
      <button type="button" class="btn" aria-pressed={mode === 'off'} aria-disabled={busy || paused}
        onclick={() => !busy && !paused && mode !== 'off' && run(() => api.roomMode(roomId, 'off'))}><Icon name="power" size={16} />{m.mode.off}</button>
    {/if}
  {/if}
{/snippet}

{#snippet statusLine()}
  {#if status && !readonly}
    {#if offline}
      <p class="st muted">{lastKnown}</p>
    {:else}
      <p class="st" class:muted={status.tone === 'muted' && !heating}>
        <span class="sentence" class:dashed={status.pending || settle.confirmed}>{#if heating}<span class="lead warm">{m.room.heatingNow}</span>{' · '}{/if}<span
            class="lead {status.tone}">{#if status.kind === 'window'}<Icon name="window" size={14} />{/if}{status.lead}</span>{#if status.rest}{' · '}{status.rest}{/if}{#if thenLevel}{', '}{thenLevel}{/if}<PendingEdge
            pending={status.pending} confirmed={!status.pending && settle.confirmed} /></span>
      </p>
      {#if power || room!.presence === true || status.someOffline || (rc.modes.length && room!.mode === 'mixed')}
        <p class="sub">
          {#if power}<span class="num"><Fig value={m.room.livePower(fmtW(power.watts))} title={m.room.livePowerTitle} rows={powerRows} provenance={powerProv} /></span>{/if}
          {#if room!.presence === true}<span>{m.room.presenceDetected}</span>{/if}
          {#if status.someOffline}<span class="part"><Icon name="plug-off" size={14} />{m.status.someOffline(status.someOffline.k, status.someOffline.n)}</span>{/if}
          {#if rc.modes.length && room!.mode === 'mixed'}<span>{m.room.mixedMode}</span>{/if}
        </p>
      {/if}
    {/if}
    {#if pending}<div class="pend"><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></div>{/if}
  {/if}
{/snippet}

{#snippet boostBlock()}
  {#if rc.boost > 0 && !offline && !readonly}
    {#if override?.kind === 'boost'}
      <section class="boostcard" aria-labelledby="{uid}-boost-h">
        <span class="hd" aria-hidden="true"><Icon name="flame" size={18} /></span>
        <div class="bt">
          <h3 id="{uid}-boost-h"><span>{m.boost.title}</span>{' · '}<span class="num">{m.roomSheet.boostRunning(fmtTemp(override.temperature),
              whenAhead(override.ends_at * 1000, now))}</span></h3>
          <p>{override.restoring ? m.status.restoring : thenAt(override.ends_at * 1000)}</p>
        </div>
        <button type="button" class="btn btn-sm" aria-disabled={paused || override.restoring}
          onclick={() => !paused && !override!.restoring && run(() => api.cancelOverride(override!.id))}>{m.boost.stop}</button>
      </section>
    {:else}
      <div class="grp boost" id="{uid}-boost">
        <h3 class="disc-h">
          <button type="button" class="disc" aria-expanded={boostOpen} aria-controls="{uid}-boost-body" onclick={() => (boostOpen = !boostOpen)}>
            <span class="ic" aria-hidden="true"><Icon name="flame" size={18} /></span>
            <span>{m.boost.title}</span>
            <span class="meta">{m.boost.meta(fmtTemp(boostTemp), fmtDuration(boostHours * 60))}</span>
            <span class="chev" class:open={boostOpen} aria-hidden="true"><Icon name="chevron-down" size={16} /></span>
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
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet backToProgram()}
  {#if mode === 'off' && !offline && rc.modes.includes('program')}
    <button type="button" class="btn btn-primary back" class:btn-lg={phone} class:btn-block={phone} aria-disabled={busy || paused}
      onclick={() => !busy && !paused && run(() => api.roomMode(roomId, 'program'))}><Icon name="resume" size={16} />{m.roomSheet.backToProgram}</button>
  {/if}
{/snippet}

{#snippet today()}
  <section aria-labelledby="{uid}-hist">
    <div class="grph-row">
      <h3 class="grph" id="{uid}-hist">{range === 'day' ? m.room.today : m.room.history}</h3>
      {#if !readonly}<Segmented options={rangeOptions} value={range} label={m.room.range} onchange={(v) => (range = v)} />{/if}
    </div>
    <div class="grp box">
      <ThermalStrip {points} {start} {end} {now} program={first?.program} mode={room!.mode} comfort={room!.comfort} eco={room!.eco}
        target={room!.target} height={96} yAxis events pendingTarget={range === 'day' ? (expected.target ?? null) : null}
        pendingComfort={range === 'day' ? (expected.comfort ?? null) : null} axis={range === 'day'}
        label={m.room.historyLabel(name, m.range[range])} {activity} inspect={readonly ? null : inspect} outdoor={outdoorPoints} />
      {#if range === 'day' && program && rc.program > 0}<div class="daybar"><DayBar {segs} label={dayLabel} ghost={mode !== 'program'} height={14} /></div>{/if}
        <!-- Always there (one line held): the legend's words arrive with the history, below it nothing moves. -->
        <p class="legend">
          {#each legend as l (l.k)}<span class="key"><span class="sw {l.k}" aria-hidden="true"></span>{l.label}</span>{/each}
          {#if mode !== 'program' && rc.program > 0}<span>{m.maison.paused}</span>{/if}
          {#if legend.some((l) => l.k === 'window' || l.k === 'presence')}<span class="muted">{m.strip.sampled}</span>{/if}
          <!-- The licence asks for the source next to the data it serves. -->
          {#if legend.some((l) => l.k === 'outdoor')}<span>· <a class="attr" href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">Open-Meteo</a></span>{/if}
        </p>
      {#if !readonly}<div class="figs"><RoomFigures {roomId} days={RANGES[range].days} {now} rangeLabel={m.range[range]} {duty} /></div>{/if}
    </div>
  </section>
{/snippet}

{#snippet temps()}
  {#if !readonly && !offline && mode !== 'off' && (comfortRange || (ecoRange && comfortNow != null))}
    <section aria-labelledby="{uid}-temps">
      <GroupedList label={m.roomSheet.programTemps} id="{uid}-temps">
        {#if comfortRange}
          <div class="li trow">
            <span class="sw comfort" aria-hidden="true"></span>
            <span class="x">{m.room.comfort}{#if aComfort.mixed && expected.comfort === undefined}<small>{m.room.mixedMean}</small>{/if}{#if rc.comfort < rc.total}<small>{m.roomCaps.partial(rc.comfort, rc.total)}</small>{/if}</span>
            <Stepper label={m.room.comfort} announce={false} value={comfortNow} min={comfortRange[0]} max={comfortRange[1]} disabled={paused}
              pending={expected.comfort !== undefined} onchange={(v) => run(() => api.roomSetpoint(roomId, 'comfort', v))} />
          </div>
        {/if}
        {#if ecoRange && comfortNow != null}
          <div class="li trow">
            <span class="sw eco" aria-hidden="true"></span>
            <span class="x">{m.room.eco}{#if deltaNow != null}<small>{m.room.ecoBelow(fmtTemp(deltaNow))}</small>{/if}{#if aEco.mixed && expected.eco_delta === undefined}<small>{m.room.mixedMean}</small>{/if}{#if rc.eco < rc.total}<small>{m.roomCaps.partial(rc.eco, rc.total)}</small>{/if}</span>
            <Stepper label={m.room.eco} announce={false} value={ecoNow} min={comfortNow - ecoRange[1]} max={comfortNow - ecoRange[0]}
              pending={expected.eco_delta !== undefined} disabled={paused} onchange={setEco} />
          </div>
        {/if}
        {#if rc.program > 0}
          <ListRow label={m.room.editHours} href="{ROUTES.schedule}?room={encodeURIComponent(roomId)}" />
        {/if}
      </GroupedList>
    </section>
  {/if}
{/snippet}

{#snippet ghostDay()}
  {#if offline && program && rc.program > 0}
    <div class="grp box">
      <p class="lbl">{m.roomSheet.programLastKnown}</p>
      <DayBar {segs} label={dayLabel} ghost ticks height={phone ? 22 : 26} />
    </div>
  {/if}
{/snippet}

{#snippet facts()}
  <section aria-labelledby="{uid}-facts">
    <h3 class="grph" id="{uid}-facts">{m.roomSheet.devices}</h3>
    {#each radiators as r (r.id)}
      <GroupedList tag="dl">
        <div class="li"><dt>{m.roomSheet.device}</dt><dd><b>{m.kind[r.kind ?? 'setpoint_heater'] ?? radiatorTitle(r)}</b><SupportChip support={r.support} /></dd></div>
        {#if r.heating_level}<div class="li"><dt>{m.roomSheet.level}</dt><dd>{levelLabel(r.heating_level)}</dd></div>{/if}
        <div class="li"><dt>{m.roomSheet.readSetpoint}</dt><dd class="num">{fmtTemp(r.effective_setpoint ?? r.target)}</dd></div>
        <div class="li"><dt>{m.roomSheet.measured}</dt><dd class="num">{fmtTemp(r.temperature)}</dd></div>
        <div class="li"><dt>{m.roomInfo.lastSignal}</dt><dd class="num">{r.last_event_at ? fmtTime(r.last_event_at * 1000) : '—'}</dd></div>
      </GroupedList>
    {/each}
  </section>
{/snippet}

{#snippet rads()}
  {#if !readonly}
    <section aria-labelledby="{uid}-rads" id="{uid}-radiators">
      <GroupedList label={m.room.radiators(radiators.length)} id="{uid}-rads" class="rads">
        {#each radiators as r (r.id)}<RadiatorPanel radiator={r} showControls={radiators.length > 1} />{/each}
      </GroupedList>
    </section>
  {/if}
{/snippet}

{#snippet monthLine()}
  {#if month && !readonly}
    <p class="month">
      <span class="muted">{m.roomSheet.month(dayOfMonth)}</span>
      <span class="num">{#if month.kwh != null}<b><Fig value={fmtKwhExact(month.kwh)} title={m.roomSheet.monthTitle}
              rows={[{ label: m.roomFigures.kwh, value: fmtKwhExact(month.kwh) }, ...(month.eur != null ? [{ label: m.roomFigures.eur, value: fmtEurExact(month.eur) }] : [])]}
              provenance={monthProv} /></b>{:else}<b>{fmtKwhExact(null)}</b>{/if}{#if month.eur != null}<span class="muted">{' · '}{m.maison.yesterdayEur(fmtEurExact(month.eur))}</span>{/if}</span>
    </p>
  {/if}
{/snippet}

{#if !house.loaded}
  <div class="sk" aria-hidden="true">
    <div class="skeleton" style:height="26px" style:width="45%"></div>
    {#each [150, 96, 150] as h, i (i)}<div class="skeleton" style:height="{h}px"></div>{/each}
  </div>
{:else if !room || !status}
  <p class="muted notfound">{m.room.notFound}</p>
{:else}
  <div class="panel {layout}">
    {#if phone}
      {@render bar()}
      <div class="stack">{@render notices()}</div>
      {#if boosting}{@render boostBlock()}{/if}
      <div class="hero">{@render hero()}</div>
      {#if readonly}
        {@render facts()}
      {:else}
        <div class="modes-wrap">{@render modes()}</div>
        <div class="center-st">{@render statusLine()}</div>
        {@render backToProgram()}
        {#if offline}{@render ghostDay()}{:else if program && rc.program > 0 && !boosting && !room.window_open}
          <div class="grp box"><DayBar {segs} label={dayLabel} ghost={mode !== 'program'} now={parisMinuteOfDay(now)} ticks height={20} /></div>
        {/if}
        {#if offline}{@render rads()}{@render today()}{:else}
          <div class="more" class:open={more}>
            <button type="button" class="more-btn grp" aria-expanded={more} aria-controls="{uid}-more" onclick={() => (more = !more)}>
              <span>{m.roomSheet.more}</span><span class="chev" class:open={more} aria-hidden="true"><Icon name="chevron-down" size={18} /></span>
            </button>
          </div>
          {#if more}
            <div class="rest" id="{uid}-more">
              {#if !boosting}{@render boostBlock()}{/if}
              {@render today()}
              {@render temps()}
              {@render rads()}
              {@render monthLine()}
            </div>
          {/if}
        {/if}
      {/if}
    {:else}
      <div class="left">
        {@render bar()}
        <div class="hero">{@render hero()}</div>
      </div>
      <div class="right">
        <div class="stack">{@render notices()}</div>
        {#if readonly}
          {@render facts()}
          {@render today()}
        {:else}
          {@render modes()}
          {@render statusLine()}
          {#if offline}
            {@render ghostDay()}
            {@render today()}
          {:else}
            {@render boostBlock()}
            {@render backToProgram()}
            {@render today()}
            {@render temps()}
          {/if}
          {@render rads()}
          {@render monthLine()}
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  p {
    margin: 0;
  }
  .sk {
    display: grid;
    gap: 16px;
  }
  .notfound {
    padding: 24px 0;
  }
  .panel.modal {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 36px;
    min-height: 0;
  }
  .panel.sheet {
    display: grid;
    gap: 14px;
  }
  .left {
    display: grid;
    align-content: start;
    justify-items: center;
    text-align: center;
    align-self: start;
    position: sticky;
    top: 0;
  }
  .right {
    display: grid;
    gap: 14px;
    align-content: start;
    min-width: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 10px;
  }
  .bar :global(.btn-icon),
  .round {
    background: var(--s2);
  }
  .ttl {
    display: grid;
    justify-items: center;
    min-width: 0;
    text-align: center;
  }
  .name {
    font-size: 17px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .big-name {
    margin-top: 4px;
    font-size: 24px;
  }
  .name.muted {
    color: var(--mu);
  }
  .head {
    color: var(--mu);
    font-size: 14px;
  }
  .sheet .head {
    font-size: 13px;
  }
  .lead.warm {
    color: var(--heat);
  }
  .lead.bad {
    color: var(--bad);
  }
  .lead.cool {
    color: var(--cool);
  }
  .lead.muted {
    color: var(--mu);
  }
  .hero {
    display: grid;
    justify-items: center;
    width: 100%;
    text-align: center;
  }
  .primary {
    width: 100%;
    margin: 26px 0 0;
  }
  .sheet .primary {
    margin-top: 8px;
  }
  .primary :global(.stepper.lg) {
    display: grid;
    width: 100%;
  }
  .display {
    margin: 40px 0 6px;
    font-size: var(--fs-display);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .sheet .display {
    margin: 18px 0 4px;
  }
  .display.off,
  .display.dimmed {
    color: var(--mu);
  }
  .cap {
    color: var(--mu);
    font-size: 13.5px;
  }
  .center {
    margin-top: 10px;
    text-align: center;
  }
  .slider {
    margin-top: 30px;
  }
  .sheet .slider {
    margin-top: 18px;
  }
  .plug {
    margin-top: 60px;
    color: var(--fa);
  }
  .sheet .plug {
    margin-top: 12px;
  }
  .plug + .cap {
    margin-top: 14px;
    font-size: 14px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 22px;
  }
  .stack {
    display: grid;
    gap: 10px;
  }
  .stack:empty {
    display: none;
  }
  .stack :global(.notice p) {
    margin: 0;
  }
  .st {
    font-size: 14px;
    line-height: 20px;
  }
  .st.muted {
    color: var(--mu);
  }
  .center-st {
    display: grid;
    justify-items: center;
    gap: 4px;
    text-align: center;
  }
  .sentence {
    position: relative;
    display: inline;
  }
  .sentence.dashed {
    display: inline-block;
    padding-bottom: 2px;
  }
  .lead {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    color: var(--mu);
    font-size: 12.5px;
  }
  .part {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pend {
    display: flex;
    min-height: 20px;
  }
  .back {
    justify-self: start;
  }
  .note {
    font-size: 12.5px;
  }
  /* Chauffe temporaire running: the heat-edged card with Arrêter (heat means a running boost). */
  .boostcard {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--r-group);
    background: var(--s1);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--heat) 40%, transparent);
  }
  .boostcard .hd {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--heat);
    color: var(--heat-ink);
  }
  .bt {
    flex: 1;
    min-width: 0;
  }
  .bt h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .bt p {
    color: var(--mu);
    font-size: 13px;
  }
  .boost {
    padding: 0 16px;
  }
  .disc-h {
    margin: 0;
    font: inherit;
  }
  .disc {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }
  .disc .ic {
    display: grid;
    color: var(--mu);
  }
  .disc .meta {
    flex: 1;
    color: var(--fa);
    font-size: 12.5px;
  }
  .chev {
    display: inline-flex;
    color: var(--mu);
    transition: transform var(--t-state) var(--ease-out);
  }
  .chev.open {
    transform: rotate(180deg);
  }
  .boost-body {
    display: grid;
    gap: 10px;
    padding: 0 0 14px;
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
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .then {
    flex: 1 1 10rem;
  }
  .grph-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 4px 0 6px;
  }
  .grph-row .grph {
    margin: 0 16px;
  }
  section > .grph,
  section > :global(.grph) {
    margin: 4px 16px 6px;
  }
  .box {
    padding: 12px 14px;
  }
  .daybar {
    margin-top: 6px;
    padding-left: 34px;
  }
  .legend {
    min-height: 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
    padding-left: 34px;
    color: var(--fa);
    font-size: 12px;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    display: inline-block;
    flex: none;
    width: 14px;
    height: 10px;
    border-radius: 2px;
  }
  .sw.temp {
    height: 2px;
    background: var(--tx);
  }
  /* The outdoor line: dashed, in its own colour, as drawn. */
  .sw.outdoor {
    height: 0;
    border-top: 2px dashed var(--outdoor);
    border-radius: 0;
  }
  /* A 44 px tall target around 12 px text, without moving the line. */
  .attr {
    padding-block: 13px;
    color: var(--mu);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .sw.setpoint {
    height: 0;
    border-top: 1px dashed var(--mu);
    border-radius: 0;
  }
  .sw.comfort {
    width: 9px;
    height: 9px;
    background: var(--heat);
  }
  .sw.eco {
    width: 9px;
    height: 9px;
    background: var(--in);
    box-shadow: inset 0 0 0 1px var(--field);
  }
  .sw.window {
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--mu) 45%, transparent) 0 1.5px, transparent 1.5px 4px);
  }
  /* The presence lane: a thin bar, as drawn along the chart's bottom. */
  .sw.presence {
    height: 4px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--mu) 55%, transparent);
  }
  .figs {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .trow {
    gap: 12px;
  }
  .trow .x {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .trow small {
    color: var(--fa);
    font-size: 12px;
  }
  section > :global(.rads) {
    padding: 0 16px;
  }
  .lbl {
    margin-bottom: 8px;
    color: var(--mu);
    font-size: 13px;
  }
  section > :global(dl) {
    margin: 0 0 10px;
  }
  section :global(dl > .li) {
    justify-content: space-between;
    gap: 12px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: 600;
  }
  .month {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 12px;
    margin-top: 2px;
  }
  .month b {
    font-weight: 600;
  }
  .modes-wrap {
    margin: 4px 4px 0;
  }
  .more-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 52px;
    border: 0;
    color: var(--tx);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }
  .rest {
    display: grid;
    gap: 14px;
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
