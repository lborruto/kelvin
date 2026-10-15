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
  import PendingTag from '$lib/components/PendingTag.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import WeekOverview from '$lib/components/WeekOverview.svelte';
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
  let howTo = $state(false);
  let showChanges = $state(false);
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
  // aria-disabled, never disabled: Envoyer keeps focus through the send.
  // A conflict offers its own two choices (Recharger, Remplacer quand même).
  let canSend = $derived(
    !busy && (changes.length > 0 || alsoRooms.length > 0) && !invalid && house.online && !conflict.length && !offline
  );
  let roomTitle = (id: string) => {
    const r = house.room(id);
    return r ? roomName(r) : id;
  };
  let room = $derived(roomId ? house.room(roomId) : undefined);
  let roomOptions = $derived(
    rooms.map((r) => ({ value: r.id, label: roomName(r), hint: isOffline(r.id) ? m.program.offline : undefined }))
  );
  // « Aussi pour… »: the other rooms that can take this week now (offline rooms cannot).
  let alsoOptions = $derived(rooms.filter((r) => r.id !== roomId && !isOffline(r.id)));
  // The phone shows one day at a time once a day is opened (`?day=`); desktop shows both.
  let phoneDay = $derived(!desktop.matches && dayView && !offline);
  // The sticky send bar: there is something to send, or a send is on its way.
  let bar = $derived(changes.length > 0 || alsoRooms.length > 0 || busy);
  let barText = $derived(busy ? m.program.sending : changes.length ? m.program.daysChanged(changes.length) : m.program.noDaysChanged);
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
    const ids = only ?? [roomId, ...alsoRooms];
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

{#snippet editor(compact: boolean)}
  <DayEditor day={selected} segs={shown![selected]} {today} {nowMinute} {compact} edited={changes.includes(selected)}
    pending={busy} locked={dayLocks[selected] ?? null} locks={dayLocks} onchange={(segs) => setDay(selected, segs)}
    onprev={() => step(-1)} onnext={() => step(1)} oncopy={applyCopy}
    below={compact ? phoneTemps : undefined} />
{/snippet}

{#snippet sendArea()}
  {#if conflict.length}
    <div class="conflict" role="alert">
      <p><Icon name="alert" size={14} /><strong>{m.program.changedElsewhere}</strong></p>
      <p class="muted">{m.program.changedElsewhereDays(conflict.map((d) => m.days[d]).join(', '))}</p>
      <div class="row">
        <button type="button" class="btn btn-sm" onclick={reload}>{m.program.reload}</button>
        <button type="button" class="btn btn-sm btn-danger" aria-disabled={busy || !house.online} onclick={replace}>{m.program.replaceAnyway}</button>
      </div>
    </div>
  {/if}
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
  <!-- Unsent edits keep Annuler and Envoyer in reach, above the tab bar on a phone. -->
  {#if bar}
    <div class="sendbar" transition:fly|global={{ y: 8, duration: dur(T.enter), easing: easeOut }}>
      <div class="bar-text">
        <span class="count" class:muted={busy}>{barText}</span>
        {#if alsoOptions.length && !busy}
          <button type="button" class="also" bind:this={alsoTrigger} aria-haspopup="dialog" onclick={() => (alsoOpen = true)}>
            {alsoRooms.length ? m.program.alsoForRooms(alsoRooms.map(roomTitle).join(', ')) : m.program.alsoFor}</button>
        {/if}
      </div>
      <div class="bar-actions">
        <button type="button" class="btn btn-sm" aria-disabled={busy || !changes.length}
          onclick={() => !busy && changes.length && (draft = baseline)}>{m.program.undo}</button>
        <button type="button" class="btn btn-sm btn-primary" aria-disabled={!canSend}
          aria-describedby={offline ? 'kv-offline-send' : undefined} onclick={() => send()}>{m.program.send}</button>
      </div>
      {#if offline}<p class="why" id="kv-offline-send">{m.program.offlineSend}</p>{/if}
      {#if changes.length && !busy}
        <button type="button" class="see" aria-expanded={showChanges} aria-controls="kv-changes" onclick={() => (showChanges = !showChanges)}>
          <Icon name="chevron" size={14} />{m.program.seeChanges}</button>
        {#if showChanges}
          <ul class="changes" id="kv-changes" transition:slide|global={{ duration: dur(T.enter), easing: easeOut }}>
            {#each changes as d (d)}
              <li><strong>{m.days[d]}</strong>{m.common.colon}{fmtSegs(draft![d])} <span class="muted">{m.program.changeBefore(fmtSegs(baseline![d]))}</span></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  {/if}
{/snippet}

{#if !phoneDay}<h1>{m.nav.schedule}</h1>{/if}
{#if !house.loaded}
  <!-- The page's shape until the house is known: the picker, the temperatures and plan, the week, the editor. -->
  <div class="sk" aria-hidden="true">
    <div class="skeleton" style:height="48px" style:width="min(100%, 320px)"></div>
    <div class="skeleton" style:height="20px" style:width="min(100%, 360px)"></div>
    <div class="skeleton" style:height="20px" style:width="min(100%, 520px)"></div>
    <div class="grid">
      <div class="sk-week">
        {#each DAYS as d (d)}<div class="skeleton" style:height="{desktop.matches ? 44 : 58}px"></div>{/each}
      </div>
      {#if desktop.matches}<div class="skeleton" style:height="360px"></div>{/if}
    </div>
  </div>
{:else if !rooms.length}
  <p class="muted">{m.program.noRooms}</p>
{:else if phoneDay && shown && radiators.length}
  <!-- Phone: one day at a time, back to the week. -->
  <a class="back" href={dayHref(null)} onclick={toWeek}><Icon name="arrow-left" size={16} />{m.program.weekOf(roomId ? roomTitle(roomId) : '')}</a>
  <div class="dayview">
    {@render editor(true)}
    {@render sendArea()}
  </div>
{:else}
  <div class="rooms">
    {#if roomId}<Segmented options={roomOptions} value={roomId} label={m.program.roomPicker} onchange={pickRoom} />{/if}
  </div>

  {#if roomId && !radiators.length}
    <p class="muted">{m.program.noRadiator}</p>
  {:else if shown}
    {#if offline}
      <div class="offline" role="status">
        <Icon name="plug-off" size={18} />
        <strong>{m.program.offlineTitle(roomTitle(roomId!))}</strong>
        <p>{m.program.offlineBody}</p>
      </div>
    {/if}
    {#if mismatch}
      <p class="warn"><Icon name="alert" size={14} /> {m.program.mismatch}</p>
    {/if}
    {@render temps(false)}
    <div class="plan">
      {#if !offline}
        <span>{room && room.mode !== 'program' && room.mode ? m.program.notRunning(m.mode[room.mode]) : fmtNow(source, now)}</span>
      {/if}
      <span>{m.program.ecoRest}</span>
      {#if !offline}
        <button type="button" class="howto" aria-expanded={howTo} aria-controls="kv-howto" onclick={() => (howTo = !howTo)}>
          <Icon name="help" size={14} />{m.program.howTo}</button>
      {/if}
    </div>
    {#if howTo && !offline}
      <p class="howto-body" id="kv-howto" transition:slide|global={{ duration: dur(T.enter), easing: easeOut }}>{m.program.howToBody}</p>
    {/if}

    <div class="grid" class:solo={offline || !desktop.matches}>
      <WeekOverview week={shown} {today} {nowMinute} selected={desktop.matches && !offline ? selected : null} changed={changes}
        locks={dayLocks} {pulse} pending={busy} interactive={!offline} onselect={openDay} />
      {#if desktop.matches && !offline}
        <aside class="side">
          {@render editor(false)}
          {@render sendArea()}
        </aside>
      {/if}
    </div>
    {#if !desktop.matches || offline}<div class="foot">{@render sendArea()}</div>{/if}

    <ChoiceSheet title={m.program.alsoSend} open={alsoOpen} trigger={alsoTrigger} onclose={() => (alsoOpen = false)}>
      <div class="chips">
        {#each alsoOptions as r (r.id)}
          <label class="chip"><input class="visually-hidden" type="checkbox" value={r.id} bind:group={alsoRooms} /><span
              aria-hidden="true" class="box"><Icon name="check" size={12} /></span>{roomName(r)}</label>
        {/each}
      </div>
      <p class="note">{m.program.alsoNote}</p>
    </ChoiceSheet>
  {/if}
{/if}

<style>
  h1 {
    font-size: 22px;
    margin: 0 0 12px;
  }
  .sk {
    display: grid;
    gap: 12px;
  }
  .sk-week {
    display: grid;
    gap: 8px;
    align-content: start;
  }
  /* The room picker scrolls inside itself when the rooms are wider than the page. */
  .rooms {
    max-width: 100%;
    /* Its width never widens the page (the « hors ligne » suffixes make it long): it scrolls instead. */
    contain: inline-size;
    overflow-x: auto;
    margin-bottom: 12px;
    padding: 2px;
    scrollbar-width: none;
  }
  .temps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 18px;
    margin: 0 0 6px;
    font-size: 14px;
  }
  .temps.compact {
    margin: 0;
    font-size: 13px;
  }
  .k {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .k b {
    font-weight: 600;
  }
  /* The same swatches as the bars: comfort is the block, eco the empty well. */
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }
  .sw.c {
    background: color-mix(in srgb, var(--warm) 75%, var(--in));
  }
  .sw.e {
    background: var(--in);
    border: 1px solid var(--field-line);
  }
  .small {
    font-size: 12px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    font-size: 13px;
    color: var(--mu);
    text-decoration: none;
  }
  @media (hover: hover) {
    .link:hover {
      color: var(--tx);
    }
  }
  .plan {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 14px;
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--mu);
  }
  .howto,
  .also,
  .see {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--mu);
    font-size: 13px;
    text-decoration: underline dotted;
    text-underline-offset: 4px;
    cursor: pointer;
    touch-action: manipulation;
  }
  @media (hover: hover) {
    .howto:hover,
    .also:hover,
    .see:hover {
      color: var(--tx);
    }
  }
  .see :global(svg) {
    transition: transform var(--t-state) var(--ease-out);
  }
  .see[aria-expanded='true'] :global(svg) {
    transform: rotate(90deg);
  }
  .howto-body {
    max-width: 65ch;
    margin: -6px 0 14px;
    font-size: 13px;
    color: var(--mu);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (min-width: 1024px) {
    .grid.solo {
      max-width: 960px;
    }
    .grid:not(.solo) {
      grid-template-columns: minmax(0, 1fr) clamp(320px, 38%, 440px);
    }
  }
  .side {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .foot,
  .dayview {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .foot:not(:empty) {
    margin-top: 12px;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    font-size: 13px;
    color: var(--mu);
    text-decoration: none;
  }
  .offline {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 4px 10px;
    max-width: 65ch;
    margin: 0 0 12px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--s2) 60%, transparent);
    font-size: 13px;
    color: var(--mu);
  }
  .offline strong {
    color: var(--tx);
    font-size: 14px;
    font-weight: 600;
  }
  .offline p {
    grid-column: 2;
    margin: 0;
  }
  .warn {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 65ch;
    margin: 0 0 8px;
    font-size: 13px;
  }
  .conflict {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--bad) 60%, var(--line));
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bad) 8%, var(--s1));
    font-size: 13px;
  }
  .conflict p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
  .sendbar {
    position: sticky;
    bottom: calc(64px + env(safe-area-inset-bottom));
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    padding: 8px 8px 8px 14px;
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .side .sendbar {
    position: static;
  }
  .bar-text {
    display: grid;
    min-width: 0;
    line-height: 1.3;
  }
  .count {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .also {
    min-height: 32px;
    font-size: 12px;
    justify-self: start;
    text-align: left;
  }
  .bar-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .sendbar .btn:not(.btn-primary) {
    background: var(--s1);
  }
  .why {
    flex-basis: 100%;
    margin: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .see {
    flex-basis: 100%;
    min-height: 32px;
    font-size: 12px;
  }
  .changes {
    flex-basis: 100%;
    margin: 0 0 4px;
    padding-left: 18px;
    font-size: 13px;
  }
  /* Room choices in « Aussi pour… »: 44 px chips; the native box is visually hidden, its focus shows on the chip. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--mu);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      border-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  .box {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--field-line);
    border-radius: 4px;
    color: transparent;
  }
  @media (hover: hover) {
    .chip:hover {
      color: var(--tx);
      border-color: var(--fa);
    }
  }
  .chip:has(:checked) {
    background: var(--s2);
    border-color: var(--mu);
    color: var(--tx);
  }
  .chip:has(:checked) .box {
    background: var(--tx);
    border-color: var(--tx);
    color: var(--bg);
  }
  .chip:has(:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--mu);
  }
  @media (min-width: 1024px) {
    .sendbar {
      bottom: 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .see :global(svg) {
      transition: none;
    }
  }
</style>
