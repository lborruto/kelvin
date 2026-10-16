<script lang="ts">
  import { untrack } from 'svelte';
  import { roomName } from '$lib/setup';
  import { fly, slide } from 'svelte/transition';
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { DAYS, type Day, type Pending } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api, ApiError } from '$lib/api/client';
  import { capsOf, programRooms } from '$lib/capabilities';
  import ChoiceSheet from '$lib/components/ChoiceSheet.svelte';
  import DayEditor from '$lib/components/DayEditor.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Notice from '$lib/components/Notice.svelte';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import WeekCalendar from '$lib/components/WeekCalendar.svelte';
  import { fmtTemp } from '$lib/format';
  import { desktop } from '$lib/media.svelte';
  import { dur, easeOut, T } from '$lib/motion';
  import { m, pendingError } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import {
    baseOf,
    changedDays,
    copyDay,
    fmtNow,
    fromMin,
    fromWeekProgram,
    lockedDays,
    shiftDay,
    toWeekProgram,
    validateDay,
    type Base,
    type Seg,
    type Week
  } from '$lib/program';
  import { follow } from '$lib/schedule-sync';
  import { announcer } from '$lib/stores/announcer.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { parisMinuteOfDay, parisParts } from '$lib/time';

  interface SentEntry {
    roomId: string;
    pendingId: string;
    week: Week;
  }

  let roomId = $state<string | null>(null);
  let draft = $state<Week | null>(null);
  let baseline = $state<Week | null>(null);
  let alsoRooms = $state<string[]>([]);
  let now = $state(Date.now());
  // The week being sent for the current room, shown read-only until the radiator answers.
  let lock = $state<{ roomId: string; pendingId: string; week: Week; timedOut?: boolean } | null>(null);
  // One line per room of the last send.
  let sentList = $state<SentEntry[]>([]);
  // True while the sends of one Envoyer are in flight: no second send, no edits that would be lost.
  let sending = $state(false);
  // Per radiator, the programme the editor started from (sent as `base`): the backend refuses to
  // overwrite a programme changed elsewhere meanwhile (owner addition, 2026-10-14).
  let base = $state<Base>({});
  // Days changed elsewhere that also hold unsent edits; non-empty shows the notice.
  let conflict = $state<Day[]>([]);
  // After a 409 mid-send: the rooms not written yet (the first of them refused); null otherwise.
  let unsentRooms = $state<string[] | null>(null);

  // The day in the editor (today first), and on a phone whether the day view replaces the week.
  let selected = $state<Day>(parisParts(Date.now()).weekday);
  let dayView = $state(false);
  // The days a copy just changed: their bars pulse once.
  let pulse = $state<{ days: Day[]; n: number } | null>(null);
  let showChanges = $state(false);
  // « Comment modifier ? »: the gestures and keys, under the header.
  let howOpen = $state(false);
  let alsoOpen = $state(false);
  let alsoTrigger = $state<HTMLButtonElement>();

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  // Plan 12: only rooms with a radiator whose programme Kelvin can edit.
  let rooms = $derived(programRooms(house.rooms, (id) => house.roomRadiators(id)));
  const programRadiators = (id: string) => house.roomRadiators(id).filter((r) => capsOf(r).program);
  // A room is offline when every radiator of its programme reports itself unreachable.
  const isOffline = (id: string) => {
    const rs = programRadiators(id);
    return rs.length > 0 && rs.every((r) => r.reachable === false);
  };

  // `?room=` (the room panel's « Modifier les horaires ») and `?day=` (the phone day view).
  const asDay = (v: string | null): Day | null => (v && (DAYS as readonly string[]).includes(v) ? (v as Day) : null);
  let roomParam = $derived(page.url.searchParams.get('room'));
  let dayParam = $derived(asDay(page.url.searchParams.get('day')));

  $effect(() => {
    if (roomId || !rooms.length) return;
    const wanted = rooms.find((r) => r.id === roomParam);
    roomId = (wanted ?? rooms.find((r) => !isOffline(r.id)) ?? rooms[0]).id;
  });
  // A later `?room=` (a link followed while the page is open) picks that room once.
  let appliedRoom: string | null = null;
  $effect(() => {
    const r = roomParam;
    const known = rooms.some((x) => x.id === r);
    untrack(() => {
      if (!r || !known || r === appliedRoom) return;
      appliedRoom = r;
      if (roomId && r !== roomId) pickRoom(r);
    });
  });
  $effect(() => {
    const d = dayParam;
    untrack(() => {
      if (d) selected = d;
      dayView = !!d;
    });
  });

  let radiators = $derived(roomId ? programRadiators(roomId) : []);
  let source = $derived(radiators[0]?.program ?? {});
  let offline = $derived(!!roomId && isOffline(roomId));
  // Days no radiator of the room may have edited (QW8): shown read-only, never in the payload.
  let dayLocks = $derived(lockedDays(radiators));
  let lockedList = $derived(Object.keys(dayLocks) as Day[]);
  let mismatch = $derived(radiators.some((r) => JSON.stringify(r.program) !== JSON.stringify(radiators[0]?.program)));
  let dirty = $derived(!!draft && !!baseline && changedDays(baseline, draft).length > 0);

  // Load the radiator's programme into the editor whenever it changes upstream. With unsent edits,
  // untouched days follow and a change on an edited day becomes a conflict (`follow`).
  $effect(() => {
    const fresh = fromWeekProgram(source);
    const freshBase = baseOf(radiators);
    if (lock && lock.roomId === roomId) return;
    untrack(() => {
      if (!dirty) {
        // Compare by value: assigning a new-but-equal object would re-trigger this effect forever.
        if (JSON.stringify(fresh) !== JSON.stringify(baseline)) {
          draft = fresh;
          baseline = fresh;
        }
        if (JSON.stringify(freshBase) !== JSON.stringify(base)) base = freshBase;
        if (conflict.length) conflict = [];
        unsentRooms = null;
        return;
      }
      const r = follow({ draft: draft!, baseline: baseline!, base }, fresh, freshBase);
      if (JSON.stringify(r.next) !== JSON.stringify({ draft, baseline, base })) {
        draft = r.next.draft;
        baseline = r.next.baseline;
        base = r.next.base;
      }
      if (r.conflict.length && JSON.stringify(r.conflict) !== JSON.stringify(conflict)) conflict = r.conflict;
    });
  });

  // React to the answer of the send that locks the editor.
  $effect(() => {
    if (!lock) return;
    const l = lock;
    const p = house.pending[l.pendingId];
    if (p && (p.status === 'sending' || p.status === 'pending')) return;
    if (p?.status !== 'failed' && l.roomId === roomId && !l.timedOut) {
      // Confirmed: keep showing the sent week until the radiator reports it (or 10 s pass).
      if (JSON.stringify(fromWeekProgram(source)) !== JSON.stringify(l.week)) {
        const t = setTimeout(() => {
          if (lock?.pendingId === l.pendingId) lock.timedOut = true;
        }, 10_000);
        return () => clearTimeout(t);
      }
    }
    lock = null;
    if (l.roomId !== roomId) return;
    if (p?.status === 'failed') draft = l.week; // unsent edits, still dirty against the baseline
    else {
      draft = l.week;
      baseline = l.week;
    }
  });

  let locked = $derived(!!lock && lock.roomId === roomId);
  let busy = $derived(locked || sending);
  // Edits nobody sent yet; the week being confirmed for this room is not one of them.
  let unsent = $derived(dirty && !(locked && JSON.stringify(draft) === JSON.stringify(lock!.week)));

  // Unsent edits are page-local: leaving the page (tab bar, link, reload) would drop them silently.
  // Moving between the week and a day (`?day=`) stays on the page and keeps them.
  beforeNavigate((nav) => {
    if (!unsent) return;
    if (nav.from && nav.to && nav.from.url.pathname === nav.to.url.pathname) return;
    if (nav.willUnload) nav.cancel(); // the browser asks with its own dialog
    else if (!confirm(m.program.discard)) nav.cancel();
  });
  let shown = $derived(locked ? lock!.week : draft);
  let changes = $derived(draft && baseline ? changedDays(baseline, draft) : []);
  let invalid = $derived(draft ? DAYS.some((d) => validateDay(draft![d]) !== null) : true);
  let today = $derived(parisParts(now).weekday);
  let nowMinute = $derived(parisMinuteOfDay(now));
  // « Aussi pour… »: the other rooms that can take this week now (offline rooms cannot).
  let alsoOptions = $derived(rooms.filter((r) => r.id !== roomId && !isOffline(r.id)));
  // The rooms chosen there that can still take it: one gone offline since is dropped from the send.
  let alsoTargets = $derived(alsoRooms.filter((id) => alsoOptions.some((r) => r.id === id)));
  // aria-disabled, never disabled: Envoyer keeps focus through the send.
  // A conflict offers its own two choices (Recharger, Remplacer quand même).
  let canSend = $derived(
    !busy && (changes.length > 0 || alsoTargets.length > 0) && !invalid && house.online && !conflict.length && !offline
  );
  let roomTitle = (id: string) => {
    const r = house.room(id);
    return r ? roomName(r) : id;
  };
  let room = $derived(roomId ? house.room(roomId) : undefined);
  let roomOptions = $derived(
    rooms.map((r) => ({ value: r.id, label: roomName(r), hint: isOffline(r.id) ? m.program.offline : undefined }))
  );
  // The phone shows one day at a time once a day is opened (`?day=`); desktop shows both.
  let phoneDay = $derived(!desktop.matches && dayView && !offline);
  // The sticky send bar: there is something to send, or a send is on its way.
  let bar = $derived(changes.length > 0 || alsoTargets.length > 0 || busy);
  let barText = $derived(
    busy
      ? m.program.sending
      : unsentRooms
        ? m.program.sendStopped
        : changes.length
          ? m.program.daysChanged(changes.length)
          : m.program.noDaysChanged
  );
  const lockText = (d: Day) => (dayLocks[d] === 'midnight' ? m.program.lockedMidnight : m.program.lockedUnrecognised);
  // A retry would overwrite later edits of the room being edited, so it is only offered while the draft is the sent week.
  let statuses = $derived(
    sentList
      .map((e) => ({ e, pending: house.pending[e.pendingId] as Pending | undefined }))
      .filter((x) => x.pending)
      .map((x) => ({
        ...x,
        stale:
          x.pending!.status === 'failed' && x.e.roomId === roomId && !!draft && JSON.stringify(draft) !== JSON.stringify(x.e.week)
      }))
  );

  const fmtSegs = (segs: { start: number; end: number }[]) =>
    segs.length ? segs.map((s) => `${fromMin(s.start)}–${fromMin(s.end)}`).join(', ') : m.program.noSlots;
  const dayHref = (d: Day | null) => {
    const q = new URLSearchParams();
    if (roomId) q.set('room', roomId);
    if (d) q.set('day', d);
    return `${ROUTES.schedule}?${q}`;
  };

  function pickRoom(id: string) {
    if (id === roomId) return;
    if (unsent && !confirm(m.program.discard)) return;
    roomId = id;
    draft = null;
    baseline = null;
    base = {};
    conflict = [];
    unsentRooms = null;
    alsoRooms = [];
    pulse = null;
  }
  function openDay(d: Day) {
    selected = d;
    if (desktop.matches) return;
    dayView = true;
    void goto(dayHref(d));
  }
  function step(delta: number) {
    selected = shiftDay(selected, delta);
    if (dayView && !desktop.matches) void goto(dayHref(selected), { replaceState: true, keepFocus: true, noScroll: true });
  }
  function toWeek(e: MouseEvent) {
    e.preventDefault();
    dayView = false;
    void goto(dayHref(null));
  }
  // A drag in the agenda edits that day and brings it into the editor.
  function dragDay(d: Day, segs: Seg[]) {
    selected = d;
    setDay(d, segs);
  }
  function setDay(d: Day, segs: Week[Day]) {
    if (!draft || busy || dayLocks[d]) return;
    draft = { ...draft, [d]: segs };
  }
  function applyCopy(days: Day[]) {
    if (!draft || busy || dayLocks[selected]) return;
    const to = days.filter((d) => d !== selected && !dayLocks[d]);
    if (!to.length) return;
    draft = copyDay(draft, selected, to, dayLocks);
    pulse = { days: to, n: (pulse?.n ?? 0) + 1 };
    announcer.say(m.program.copied(to.length));
  }
  /** `only`: after a 409, « Remplacer quand même » sends the rooms not written yet, once each. */
  async function send(force = false, only: string[] | null = null) {
    if (!draft || !roomId || !(canSend || (force && !busy && house.online && !invalid && !offline))) return;
    const week = draft;
    const ids = only ?? [roomId, ...alsoTargets];
    const results: (Pending | null)[] = [];
    let stopped = false;
    sending = true;
    try {
      for (const [i, id] of ids.entries()) {
        const b = id === roomId ? base : baseOf(programRadiators(id));
        // Locked days are kept as each radiator reports them, in this room and every other
        // (final review C1): a send never empties a day it does not mean to change.
        const opts = { base: b, ...(lockedList.length ? { keep: lockedList } : {}), ...(force ? { force: true } : {}) };
        results.push(
          await run(() => api.roomProgram(id, toWeekProgram(week, lockedList), opts), {
            onError: (e) => {
              if (!(e instanceof ApiError) || e.code !== 'program_changed_elsewhere') return false;
              const days = ((e.params?.days as Day[] | undefined) ?? []).filter((d) => DAYS.includes(d));
              conflict = days.length ? days : changes;
              unsentRooms = ids.slice(i);
              stopped = true;
              return true;
            }
          })
        );
        // A change made elsewhere stops the whole send: nothing more is written (final review I2).
        if (stopped) break;
      }
    } finally {
      sending = false;
    }
    const sentNow = ids.flatMap((id, i) => {
      const p = results[i];
      return p ? [{ roomId: id, pendingId: p.id, week }] : [];
    });
    sentList = only ? [...sentList.filter((e) => !ids.includes(e.roomId)), ...sentNow] : sentNow;
    // Any failure keeps the edits as they are; the toast or the notice already explains.
    if (stopped || results.some((p) => p === null)) return;
    alsoRooms = [];
    conflict = [];
    unsentRooms = null;
    showChanges = false;
    const mine = sentList.find((e) => e.roomId === roomId);
    if (mine) lock = { roomId, pendingId: mine.pendingId, week };
  }
  function reload() {
    const fresh = fromWeekProgram(source);
    draft = fresh;
    baseline = fresh;
    base = baseOf(radiators);
    conflict = [];
    unsentRooms = null;
  }
  const replace = () => !busy && house.online && send(true, unsentRooms);
  async function retryEntry(id: string) {
    const entry = sentList.find((e) => e.pendingId === id);
    const np = await retry(id);
    if (np && entry) {
      entry.pendingId = np.id;
      if (entry.roomId === roomId && !lock) lock = { roomId: entry.roomId, pendingId: np.id, week: entry.week };
    }
  }
</script>

<svelte:head><title>{m.page.title(m.nav.schedule)}</title></svelte:head>

{#snippet temps(compact: boolean)}
  <div class="temps" class:compact>
    <span class="k"><i class="sw c" aria-hidden="true"></i>{m.level.comfort} <b class="num">{fmtTemp(room?.comfort)}</b></span>
    <span class="k"><i class="sw e" aria-hidden="true"></i>{m.level.eco} <b class="num">{fmtTemp(room?.eco)}</b></span>
    {#if offline}
      <span class="muted small">{m.program.lastKnown}</span>
    {:else if !compact && roomId}
      <a class="link" href={ROUTES.room(roomId)}>{m.program.editTemps}<Icon name="chevron" size={14} /></a>
    {/if}
  </div>
{/snippet}

{#snippet phoneTemps()}{@render temps(true)}{/snippet}

{#snippet back()}
  <a class="back" href={dayHref(null)} onclick={toWeek}><Icon name="chevron-left" size={20} />{m.program.weekOf(roomId ? roomTitle(roomId) : '')}</a>
{/snippet}

{#snippet editor(compact: boolean)}
  <DayEditor day={selected} segs={shown![selected]} {today} {nowMinute} {compact} room={roomId ? roomTitle(roomId) : ''}
    edited={changes.includes(selected)} pending={busy} locked={dayLocks[selected] ?? null} locks={dayLocks}
    onchange={(segs) => setDay(selected, segs)} onprev={() => step(-1)} onnext={() => step(1)} oncopy={applyCopy}
    back={compact ? back : undefined} below={compact && !dayLocks[selected] ? phoneTemps : undefined} />
{/snippet}

{#snippet sendArea()}
  {@render statusList()}
  <!-- The conflict notice and the send bar travel together: sticky above the tab bar on a phone. -->
  {#if conflict.length || bar}<div class="dock">
  {#if conflict.length}
    <Notice tone="bad" title={m.program.changedElsewhere} role="alert">
      {m.program.changedElsewhereDays(conflict.map((d) => m.days[d]).join(', '))}
      <span class="row">
        <button type="button" class="btn btn-sm" onclick={reload}>{m.program.reload}</button>
        <button type="button" class="btn btn-sm btn-danger" aria-disabled={busy || !house.online} onclick={replace}>{m.program.replaceAnyway}</button>
      </span>
    </Notice>
  {/if}
  <!-- Unsent edits keep Annuler and Envoyer in reach, above the tab bar on a phone. -->
  {#if bar}
    <div class="sendbar" transition:fly|global={{ y: 8, duration: dur(T.enter), easing: easeOut }}>
      <div class="bar-main">
        <div class="bar-text">
          <span class="count" class:muted={busy}>{barText}</span>
          {#if alsoOptions.length && !busy}
            <button type="button" class="also" bind:this={alsoTrigger} aria-haspopup="dialog" onclick={() => (alsoOpen = true)}>
              {alsoTargets.length ? m.program.alsoForRooms(alsoTargets.map(roomTitle).join(', ')) : m.program.alsoFor}</button>
          {/if}
        </div>
        <div class="bar-actions">
          <button type="button" class="btn btn-sm undo" aria-disabled={busy || !changes.length}
            onclick={() => !busy && changes.length && (draft = baseline)}>{m.program.undo}</button>
          <button type="button" class="btn btn-sm btn-primary" aria-disabled={!canSend}
            aria-describedby={offline ? 'kv-offline-send' : undefined} onclick={() => send()}>{m.program.send}</button>
        </div>
      </div>
      {#if offline}<p class="why" id="kv-offline-send">{m.program.offlineSend}</p>{/if}
      {#if desktop.matches && !busy}
        <p class="note foot-note">{m.program.copyNote}
          {#if changes.length}
            <button type="button" class="see" aria-expanded={showChanges} aria-controls="kv-changes" onclick={() => (showChanges = !showChanges)}>{m.program.seeChanges}</button>
          {/if}
        </p>
        {#if showChanges && changes.length}
          <ul class="changes" id="kv-changes" transition:slide|global={{ duration: dur(T.enter), easing: easeOut }}>
            {#each changes as d (d)}
              <li><strong>{m.days[d]}</strong>{m.common.colon}{fmtSegs(draft![d])} <span class="muted">{m.program.changeBefore(fmtSegs(baseline![d]))}</span></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
  </div>{/if}
{/snippet}

{#snippet statusList()}
  {#if statuses.length}
    <ul class="status">
      {#each statuses as { e, pending, stale } (e.roomId)}
        <li>
          <span>{roomTitle(e.roomId)}</span>
          {#if stale}
            <span class="stale"><Icon name="alert" size={14} /> {pendingError(pending!)} {m.program.staleHint}
              <button type="button" class="btn btn-icon" aria-label={m.common.dismiss} onclick={() => house.dismiss(e.pendingId)}><Icon name="x" size={16} /></button></span>
          {:else}
            <PendingTag {pending} onretry={retryEntry} ondismiss={(id) => house.dismiss(id)} />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#if !phoneDay}
  <header class="head">
    <div class="titles">
      <h1 class="t-page">{m.nav.schedule}</h1>
      {#if desktop.matches}<p class="lede">{m.program.ecoRest}</p>{/if}
    </div>
    {#if house.loaded && rooms.length && shown && !offline}
      <button type="button" class="how" class:round={!desktop.matches} aria-expanded={howOpen} aria-controls="kv-howto"
        aria-label={desktop.matches ? undefined : m.program.howTo} onclick={() => (howOpen = !howOpen)}>
        <Icon name="help" size={desktop.matches ? 16 : 18} />{#if desktop.matches}<span>{m.program.howTo}</span>{/if}
      </button>
    {/if}
  </header>
  {#if howOpen && house.loaded && !offline}
    <div class="howto" id="kv-howto" transition:slide|global={{ duration: dur(T.enter), easing: easeOut }}>
      {#if !desktop.matches}<p><b>{m.program.ecoRest}</b></p>{/if}
      <p>{m.program.howToBody}</p>
    </div>
  {/if}
{/if}
{#if !house.loaded}
  <!-- The page's shape until the house is known: the room chips, the temperatures and plan, the agenda, the editor. -->
  <div class="sk" aria-hidden="true">
    <div class="sk-row">{#each [64, 92, 120] as w (w)}<div class="skeleton" style:height="32px" style:width="{w}px"></div>{/each}{#if desktop.matches}<div
          class="skeleton" style:height="32px" style:width="min(30%, 420px)" style:margin-left="27px"></div>{/if}</div>
    {#if !desktop.matches}<div class="skeleton" style:height="20px" style:width="min(100%, 240px)"></div>{/if}
    <div class="skeleton" style:height="18px" style:width="min(100%, 220px)"></div>
    <div class="grid" class:solo={!desktop.matches}>
      <div class="skeleton cal-sk"></div>
      {#if desktop.matches}<div class="sk-side"><div class="skeleton" style:height="400px"></div><div class="skeleton" style:height="90px"></div></div>{/if}
    </div>
  </div>
{:else if !rooms.length}
  <p class="muted">{m.program.noRooms}</p>
{:else if phoneDay && shown && radiators.length}
  <!-- Phone: one day at a time, back to the week. -->
  <div class="dayview">
    {@render editor(true)}
    {#if dayLocks[selected]}
      <p class="grph">{m.program.roomTemps}</p>
      <ul class="grp temps-grp">
        <li class="li"><span>{m.level.comfort}</span><b class="num">{fmtTemp(room?.comfort)}</b></li>
        <li class="li"><span>{m.level.eco}</span><b class="num">{fmtTemp(room?.eco)}</b></li>
      </ul>
    {/if}
    {@render sendArea()}
  </div>
{:else}
  <div class="rooms-row">
    <div class="rooms">
      {#if roomId}<Segmented variant="chips" hideHints={!desktop.matches} options={roomOptions} value={roomId} label={m.program.roomPicker}
          onchange={pickRoom} />{/if}
    </div>
    {#if desktop.matches && shown && radiators.length}<span class="divider" aria-hidden="true"></span>{@render temps(false)}{/if}
  </div>

  {#if roomId && !radiators.length}
    <p class="muted">{m.program.noRadiator}</p>
  {:else if shown}
    {#if !desktop.matches}{@render temps(false)}{/if}
    {#if !offline}
      <p class="plan">{room && room.mode !== 'program' && room.mode ? m.program.notRunning(m.mode[room.mode]) : fmtNow(source, now)}</p>
    {/if}
    {#if offline}
      <div class="notice-wrap">
        <Notice title={m.program.offlineTitle(roomTitle(roomId!))} icon="plug-off">{m.program.offlineBody}</Notice>
      </div>
    {/if}
    {#if mismatch}
      <p class="warn"><Icon name="alert" size={14} /> {m.program.mismatch}</p>
    {/if}

    <div class="grid" class:solo={offline || !desktop.matches}>
      <div class="calw" class:compact={!desktop.matches}>
        <WeekCalendar week={shown} {today} {nowMinute} selected={desktop.matches && !offline ? selected : null} changed={changes}
          locks={dayLocks} {pulse} pending={busy} interactive={!offline} compact={!desktop.matches} onselect={openDay}
          onedit={desktop.matches && !offline ? dragDay : undefined} />
      </div>
      {#if desktop.matches && !offline}
        <aside class="side">
          {@render editor(false)}
          {@render sendArea()}
        </aside>
      {/if}
    </div>
    {#if !desktop.matches && !offline}
      <div class="week-notes">
        <p class="note">{m.program.tapDay}</p>
        {#each lockedList as d (d)}<p class="note" data-lock={d}><Icon name="lock" size={12} />{m.program.dayReason(m.days[d], lockText(d))}</p>{/each}
      </div>
    {/if}
    {#if !desktop.matches || offline}<div class="foot">{@render sendArea()}</div>{/if}
  {/if}
{/if}

<!-- Outside the week/day branches: the day view's send bar opens it too. -->
{#if house.loaded && rooms.length}
  <ChoiceSheet title={m.program.alsoSend} open={alsoOpen} trigger={alsoTrigger} onclose={() => (alsoOpen = false)}>
    <div class="chips">
      {#each alsoOptions as r (r.id)}
        <label class="rchip hit"><input class="visually-hidden" type="checkbox" value={r.id} bind:group={alsoRooms} />{roomName(r)}<span
            aria-hidden="true" class="tick"><Icon name="check" size={14} /></span></label>
      {/each}
    </div>
    <p class="note">{m.program.alsoNote}</p>
  </ChoiceSheet>
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 6px 0 0;
  }
  .titles {
    min-width: 0;
  }
  .lede {
    margin: 4px 0 0;
    font-size: var(--fs-body);
    color: var(--mu);
  }
  .how {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .how span {
    color: var(--tx);
    text-decoration: underline dotted;
    text-underline-offset: 4px;
  }
  .how.round {
    position: relative;
    justify-content: center;
    width: 36px;
    min-height: 36px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--tx);
  }
  .how.round::before {
    content: '';
    position: absolute;
    inset: -4px;
  }
  @media (hover: hover) {
    .how:hover span {
      color: var(--tx);
    }
  }
  .howto {
    max-width: 65ch;
    margin: 10px 0 0;
    padding: 12px 14px;
    border-radius: var(--r-group);
    background: var(--s1);
    font-size: 13px;
    color: var(--mu);
  }
  .howto p {
    margin: 0;
  }
  .howto p + p {
    margin-top: 6px;
  }
  .howto b {
    color: var(--tx);
    font-weight: 600;
  }
  .sk {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }
  .sk-row {
    display: flex;
    gap: 8px;
  }
  .cal-sk {
    height: 670px;
    border-radius: var(--r-widget);
  }
  .sk-side {
    display: grid;
    gap: 12px;
    align-content: start;
  }
  @media (max-width: 1023px) {
    .cal-sk {
      height: 346px;
    }
  }
  /* Room chips, then (desktop) a hairline and the temperatures. The chips scroll inside themselves when they
     are wider than the page; their width never widens it. */
  .rooms-row {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 16px 0 8px;
    min-width: 0;
  }
  .rooms {
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    padding: 2px;
    scrollbar-width: none;
  }
  @media (max-width: 1023px) {
    .rooms-row {
      margin: 12px calc(-1 * var(--gutter)) 10px;
    }
    .rooms {
      padding: 2px var(--gutter);
    }
  }
  .divider {
    flex: none;
    width: 1px;
    height: 24px;
    background: var(--line);
  }
  .temps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 18px;
    margin: 0 0 4px;
    font-size: 14px;
    min-width: 0;
  }
  .rooms-row .temps {
    margin: 0;
  }
  .temps.compact {
    margin: 8px 0 0;
    font-size: 13.5px;
  }
  .k {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .k b {
    font-weight: 600;
  }
  /* The same swatches as the agenda: comfort is the block, eco the empty well. */
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .sw.c {
    background: var(--heat);
  }
  .sw.e {
    background: var(--in);
    box-shadow: inset 0 0 0 1px var(--field);
  }
  .small {
    font-size: 12px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    font-size: 14px;
    color: var(--mu);
    text-decoration: none;
    white-space: nowrap;
  }
  @media (hover: hover) {
    .link:hover {
      color: var(--tx);
    }
  }
  .plan {
    margin: 0 0 14px;
    font-size: 13px;
    color: var(--fa);
  }
  .notice-wrap {
    max-width: 65ch;
    margin: 0 0 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  @media (min-width: 1024px) {
    .grid.solo {
      max-width: 960px;
    }
    .grid:not(.solo) {
      grid-template-columns: minmax(0, 1fr) clamp(340px, 32%, 410px);
    }
  }
  .calw {
    padding: 10px 14px;
    background: var(--s1);
    border-radius: var(--r-widget);
    min-width: 0;
  }
  .calw.compact {
    padding: 8px 8px 4px;
    border-radius: var(--r-tile);
  }
  .side {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .week-notes {
    margin-top: 10px;
  }
  .week-notes .note {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0;
  }
  .dayview {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  /* Under the week the send area's pieces belong to main itself, so the dock can stay sticky over the whole
     page (a sticky element never leaves its parent). */
  .foot {
    display: contents;
  }
  .foot > :global(*) {
    margin-top: 12px;
  }
  .dayview .grph {
    margin-bottom: -6px;
  }
  .temps-grp .li {
    justify-content: space-between;
    font-size: 15px;
  }
  .temps-grp b {
    font-weight: 600;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    min-width: 0;
    font-size: 15px;
    color: var(--mu);
    text-decoration: none;
  }
  .warn {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 65ch;
    margin: 0 0 10px;
    font-size: 13px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .status {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }
  .status li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }
  .stale {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bad);
  }
  /* The SendBar (Tableau): an s2 card (16 px, hairline) holding the count and « Aussi pour… », Annuler and
     Envoyer; sticky above the tab bar on a phone, under the editor on desktop. */
  .dock {
    position: sticky;
    bottom: calc(var(--tabbar-h) + 14px + env(safe-area-inset-bottom));
    z-index: 10;
    display: grid;
    gap: 10px;
  }
  /* Sticky over the page: the tint is mixed onto bg so nothing shows through. */
  .dock :global(.notice.bad) {
    background: color-mix(in srgb, var(--bad) 12%, var(--bg));
  }
  .side .dock {
    position: static;
  }
  .sendbar {
    padding: 12px 14px;
    background: var(--s2);
    border-radius: var(--r-group);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .bar-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
  }
  .bar-text {
    display: grid;
    justify-items: start;
    min-width: 0;
    line-height: 1.3;
  }
  .count {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .also,
  .see {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: 13px;
    text-align: left;
    text-decoration: underline dotted;
    text-underline-offset: 4px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .see {
    min-height: 0;
    color: var(--mu);
    font-size: inherit;
  }
  @media (hover: hover) {
    .also:hover,
    .see:hover {
      color: var(--tx);
    }
  }
  .bar-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .undo {
    background: var(--s3);
  }
  .why {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .foot-note {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--mu);
  }
  .changes {
    margin: 6px 0 2px;
    padding-left: 18px;
    font-size: 13px;
  }
  /* Room choices in « Aussi pour… »: 40 px pills, ink with ✓ once picked; the native box is visually hidden,
     its focus shows on the pill. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .rchip {
    --ctl-h: 40px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--s2);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  .tick {
    display: none;
  }
  .rchip:has(:checked) {
    background: var(--tx);
    color: var(--bg);
  }
  .rchip:has(:checked) .tick {
    display: inline-grid;
  }
  .rchip:has(:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .note {
    margin: 0;
  }
  @media (min-width: 1024px) {
    .dock {
      bottom: 16px;
    }
  }
</style>
