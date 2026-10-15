<script lang="ts">
  import { untrack } from 'svelte';
  import { roomName } from '$lib/setup';
  import { fly } from 'svelte/transition';
  import { beforeNavigate } from '$app/navigation';
  import { DAYS, type Day, type Pending } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api, ApiError } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import ProgramDay from '$lib/components/ProgramDay.svelte';
  import RoomTodayStrip from '$lib/components/RoomTodayStrip.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { desktop } from '$lib/media.svelte';
  import { dur, easeOut, T } from '$lib/motion';
  import { m, pendingError } from '$lib/i18n';
  import {
    baseOf,
    changedDays,
    fromMin,
    fromWeekProgram,
    lockedDays,
    toWeekProgram,
    validateDay,
    type Base,
    type Week
  } from '$lib/program';
  import { follow } from '$lib/schedule-sync';
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
  let copyFrom = $state<Day>('monday');
  let copyTo = $state<Day[]>([]);
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

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (!roomId && house.rooms.length) roomId = house.rooms[0].id;
  });

  let radiators = $derived(roomId ? house.roomRadiators(roomId) : []);
  let source = $derived(radiators[0]?.program ?? {});
  // Days no radiator of the room may have edited (QW8): shown read-only, never in the payload.
  let dayLocks = $derived(lockedDays(radiators));
  let lockedList = $derived(Object.keys(dayLocks) as Day[]);
  // « Du » never rests on a locked day (it is not in the list): the first unlocked day takes over.
  $effect(() => {
    if (dayLocks[copyFrom]) copyFrom = DAYS.find((d) => !dayLocks[d]) ?? copyFrom;
  });
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
  beforeNavigate((nav) => {
    if (!unsent) return;
    if (nav.willUnload) nav.cancel(); // the browser asks with its own dialog
    else if (!confirm(m.program.discard)) nav.cancel();
  });
  let shown = $derived(locked ? lock!.week : draft);
  let changes = $derived(draft && baseline ? changedDays(baseline, draft) : []);
  let invalid = $derived(draft ? DAYS.some((d) => validateDay(draft![d]) !== null) : true);
  let today = $derived(parisParts(now).weekday);
  // aria-disabled, never disabled: Envoyer keeps focus through the send.
  // A conflict offers its own two choices (Recharger, Remplacer quand même).
  let canSend = $derived(
    !busy && (changes.length > 0 || alsoRooms.length > 0) && !invalid && house.online && !conflict.length
  );
  let roomTitle = (id: string) => {
    const r = house.room(id);
    return r ? roomName(r) : id;
  };
  let roomOptions = $derived(house.rooms.map((r) => ({ value: r.id, label: roomName(r) })));
  // Phone: one day open at a time (today first), the others show only their bar.
  // null: nothing chosen yet (today is open); 'none': the user closed every day.
  let openDay = $state<Day | 'none' | null>(null);
  let shownDay = $derived(openDay === null ? today : openDay === 'none' ? null : openDay);
  // The sticky send bar: there is something to send, or a send is on its way.
  let bar = $derived(changes.length > 0 || alsoRooms.length > 0 || busy);
  let barText = $derived.by(() => {
    if (busy) return m.program.sending;
    const days = changes.length ? m.program.daysChanged(changes.length) : m.program.noDaysChanged;
    return alsoRooms.length ? `${days} · ${m.program.otherRooms(alsoRooms.length)}` : days;
  });
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
  }
  function applyCopy() {
    if (!draft || busy || !copyTo.length) return;
    const src = draft[copyFrom];
    const next = { ...draft };
    for (const d of copyTo) next[d] = src.map((s) => ({ ...s }));
    draft = next;
    copyTo = [];
  }
  /** `only`: after a 409, « Remplacer quand même » sends the rooms not written yet, once each. */
  async function send(force = false, only: string[] | null = null) {
    if (!draft || !roomId || !(canSend || (force && !busy && house.online && !invalid))) return;
    const week = draft;
    const ids = only ?? [roomId, ...alsoRooms];
    const results: (Pending | null)[] = [];
    let stopped = false;
    sending = true;
    try {
      for (const [i, id] of ids.entries()) {
        const b = id === roomId ? base : baseOf(house.roomRadiators(id));
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

<h1>{m.nav.schedule}</h1>
{#if !house.loaded}
  <!-- The editor's shape until the house is known: the room picker, today's strip, seven days. -->
  <div class="sk" aria-hidden="true">
    <div class="skeleton" style:height="48px" style:width="min(100%, 320px)"></div>
    <div class="skeleton" style:height="70px"></div>
    {#each DAYS as d (d)}<div class="skeleton" style:height="{desktop.matches ? 108 : 64}px"></div>{/each}
  </div>
{:else}
  <div class="rooms">
    {#if roomId}<Segmented options={roomOptions} value={roomId} label={m.program.roomPicker} onchange={pickRoom} />{/if}
  </div>

  {#if roomId && !radiators.length}
    <p class="muted">{m.program.noRadiator}</p>
  {:else if shown}
    {@const lg = m.program.legend()}
    {#if mismatch}
      <p class="warn"><Icon name="alert" size={14} /> {m.program.mismatch}</p>
    {/if}
    <p class="muted legend">{lg.before}<strong>{lg.comfort}</strong>{lg.middle}<strong>{lg.eco}</strong>{lg.after} {m.program.midnightCap}</p>

    {#if roomId}
      <section class="today">
        <h2>{m.program.today}</h2>
        <RoomTodayStrip {roomId} height={48} axis program={toWeekProgram(shown)}
          label={m.program.previewLabel(roomTitle(roomId))} />
      </section>
    {/if}

    <div class="week">
      {#each DAYS as d (d)}
        <ProgramDay day={d} segs={shown[d]} pending={busy} nowMinute={d === today ? parisMinuteOfDay(now) : null}
          collapsible={!desktop.matches} open={shownDay === d} ontoggle={() => (openDay = shownDay === d ? 'none' : d)}
          onchange={(segs) => (draft = { ...draft!, [d]: segs })} locked={dayLocks[d] ?? null} />
      {/each}
    </div>

    <section class="tools">
      <h2>{m.program.copy}</h2>
      <div class="row">
        <label class="from">{m.program.copyFrom} <select bind:value={copyFrom} disabled={busy}>{#each DAYS.filter((d) => !dayLocks[d]) as d (d)}<option value={d}>{m.days[d]}</option>{/each}</select></label>
        <span>{m.program.copyTo}</span>
      </div>
      <div class="chips">
        {#each DAYS.filter((d) => d !== copyFrom && !dayLocks[d]) as d (d)}
          <label class="chip"><input class="visually-hidden" type="checkbox" value={d} bind:group={copyTo} disabled={busy} /><span
              aria-hidden="true" class="box"><Icon name="check" size={12} /></span>{m.daysShort[d]}</label>
        {/each}
        <button type="button" class="btn btn-sm" aria-disabled={busy || !copyTo.length} onclick={applyCopy}>{m.program.copy}</button>
      </div>
      {#if house.rooms.length > 1}
        <h2 class="also">{m.program.alsoSend}</h2>
        <div class="chips">
          {#each house.rooms.filter((r) => r.id !== roomId) as r (r.id)}
            <label class="chip"><input class="visually-hidden" type="checkbox" value={r.id} bind:group={alsoRooms} disabled={busy} /><span
                aria-hidden="true" class="box"><Icon name="check" size={12} /></span>{roomName(r)}</label>
          {/each}
        </div>
      {/if}
    </section>

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

    {#if changes.length || statuses.length}
      <section class="send">
        {#if changes.length}
          <h2>{m.program.changes}</h2>
          <ul>
            {#each changes as d (d)}
              <li><strong>{m.days[d]}</strong>{m.common.colon}{fmtSegs(draft![d])} <span class="muted">{m.program.changeBefore(fmtSegs(baseline![d]))}</span></li>
            {/each}
          </ul>
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
      </section>
    {/if}

    <!-- Unsent edits keep Annuler and Envoyer in reach, above the tab bar on a phone. -->
    {#if bar}
      <div class="sendbar" transition:fly={{ y: 8, duration: dur(T.enter), easing: easeOut }}>
        <span class="bar-text" class:muted={busy}>{barText}</span>
        <div class="bar-actions">
          <button type="button" class="btn" aria-disabled={busy || !changes.length} onclick={() => !busy && changes.length && (draft = baseline)}>{m.program.undo}</button>
          <button type="button" class="btn btn-primary" aria-disabled={!canSend}
            onclick={() => send()}>{m.program.send}</button>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .conflict {
    display: grid;
    gap: 6px;
    max-width: 65ch;
    margin: 12px 0;
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
  .conflict .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .sk {
    display: grid;
    gap: 10px;
    max-width: 900px;
  }
  /* The room picker scrolls inside itself when the rooms are wider than the page. */
  .rooms {
    max-width: 100%;
    overflow-x: auto;
    margin-bottom: 12px;
    padding: 2px;
    scrollbar-width: none;
  }
  .legend,
  .warn {
    font-size: 13px;
    margin: 0 0 8px;
    max-width: 65ch;
  }
  .warn {
    color: var(--tx);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status {
    list-style: none;
    padding: 0;
  }
  .stale {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bad);
  }
  .status li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }
  .today {
    max-width: 900px;
    margin: 12px 0;
  }
  .week {
    max-width: 900px;
  }
  .tools,
  .send {
    margin-top: 16px;
    max-width: 900px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .from {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .also {
    margin-top: 14px;
  }
  /* Day and room choices: 44 px chips; the native box is visually hidden, its focus shows on the chip. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
    border: 1px solid var(--field-line);
    border-radius: 4px;
    color: transparent;
  }
  @media (hover: hover) {
    .chip:not(:has(:disabled)):hover {
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
  .chip:has(:disabled) {
    color: var(--fa);
    cursor: default;
  }
  ul {
    margin: 0 0 10px;
    padding-left: 18px;
    font-size: 13px;
  }
  .sendbar {
    position: sticky;
    bottom: calc(64px + env(safe-area-inset-bottom));
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    max-width: 900px;
    margin-top: 16px;
    padding: 8px 8px 8px 14px;
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .bar-text {
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .bar-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .sendbar .btn:not(.btn-primary) {
    background: var(--s1);
  }
  @media (min-width: 1024px) {
    .sendbar {
      bottom: 16px;
    }
  }
</style>
