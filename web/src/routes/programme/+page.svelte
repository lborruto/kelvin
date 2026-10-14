<script lang="ts">
  import { fly } from 'svelte/transition';
  import { beforeNavigate } from '$app/navigation';
  import { DAYS, type Day, type Pending } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import ProgramDay from '$lib/components/ProgramDay.svelte';
  import RoomTodayStrip from '$lib/components/RoomTodayStrip.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { desktop } from '$lib/media.svelte';
  import { dur, easeOut, T } from '$lib/motion';
  import { plural } from '$lib/plural';
  import {
    changedDays, DAY_LABEL, DAY_SHORT, fromMin, fromWeekProgram, toWeekProgram, validateDay, type Week
  } from '$lib/program';
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
  const DISCARD = 'Abandonner les modifications non envoyées ?';

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (!roomId && house.rooms.length) roomId = house.rooms[0].id;
  });

  let radiators = $derived(roomId ? house.roomRadiators(roomId) : []);
  let source = $derived(radiators[0]?.program ?? {});
  let mismatch = $derived(radiators.some((r) => JSON.stringify(r.program) !== JSON.stringify(radiators[0]?.program)));
  let dirty = $derived(!!draft && !!baseline && changedDays(baseline, draft).length > 0);

  // Load the radiator's programme into the editor whenever it changes upstream and the user has no edits.
  $effect(() => {
    const fresh = fromWeekProgram(source);
    if (lock && lock.roomId === roomId) return;
    // Compare by value: assigning a new-but-equal object would re-trigger this effect forever.
    if (!dirty && JSON.stringify(fresh) !== JSON.stringify(baseline)) {
      draft = fresh;
      baseline = fresh;
    }
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
    else if (!confirm(DISCARD)) nav.cancel();
  });
  let shown = $derived(locked ? lock!.week : draft);
  let changes = $derived(draft && baseline ? changedDays(baseline, draft) : []);
  let invalid = $derived(draft ? DAYS.some((d) => validateDay(draft![d]) !== null) : true);
  let today = $derived(parisParts(now).weekday);
  let roomName = (id: string) => house.room(id)?.name ?? id;
  let roomOptions = $derived(house.rooms.map((r) => ({ value: r.id, label: r.name })));
  // Phone: one day open at a time (today first), the others show only their bar.
  let openDay = $state<Day | null>(null);
  let shownDay = $derived(openDay ?? today);
  // The sticky send bar: there is something to send, or a send is on its way.
  let bar = $derived(changes.length > 0 || alsoRooms.length > 0 || busy);
  let barText = $derived.by(() => {
    if (busy) return 'Envoi en cours…';
    const days = changes.length ? plural(changes.length, 'jour modifié', 'jours modifiés') : 'Aucun jour modifié';
    return alsoRooms.length ? `${days} · ${plural(alsoRooms.length, 'autre pièce', 'autres pièces')}` : days;
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
    segs.length ? segs.map((s) => `${fromMin(s.start)}–${fromMin(s.end)}`).join(', ') : 'aucune plage (éco)';

  function pickRoom(id: string) {
    if (id === roomId) return;
    if (unsent && !confirm(DISCARD)) return;
    roomId = id;
    draft = null;
    baseline = null;
    alsoRooms = [];
  }
  function applyCopy() {
    if (!draft) return;
    const src = draft[copyFrom];
    const next = { ...draft };
    for (const d of copyTo) next[d] = src.map((s) => ({ ...s }));
    draft = next;
    copyTo = [];
  }
  async function send() {
    if (!draft || !roomId || busy) return;
    const week = draft;
    const payload = toWeekProgram(week);
    const ids = [roomId, ...alsoRooms];
    const results: (Pending | null)[] = [];
    sending = true;
    try {
      for (const id of ids) results.push(await run(() => api.roomProgram(id, payload)));
    } finally {
      sending = false;
    }
    sentList = ids.flatMap((id, i) => {
      const p = results[i];
      return p ? [{ roomId: id, pendingId: p.id, week }] : [];
    });
    // Any failure keeps the edits as they are; the toast already explains.
    if (results.some((p) => p === null)) return;
    alsoRooms = [];
    lock = { roomId: ids[0], pendingId: results[0]!.id, week };
  }
  async function retryEntry(id: string) {
    const entry = sentList.find((e) => e.pendingId === id);
    const np = await retry(id);
    if (np && entry) {
      entry.pendingId = np.id;
      if (entry.roomId === roomId && !lock) lock = { roomId: entry.roomId, pendingId: np.id, week: entry.week };
    }
  }
</script>

<svelte:head><title>Programme · Kelvin</title></svelte:head>

<h1>Programme</h1>
{#if !house.loaded}
  <!-- The editor's shape until the house is known: the room picker, today's strip, seven days. -->
  <div class="sk" aria-hidden="true">
    <div class="skeleton" style:height="48px" style:width="min(100%, 320px)"></div>
    <div class="skeleton" style:height="70px"></div>
    {#each DAYS as d (d)}<div class="skeleton" style:height="{desktop.matches ? 108 : 64}px"></div>{/each}
  </div>
{:else}
  <div class="rooms">
    {#if roomId}<Segmented options={roomOptions} value={roomId} label="Pièce" onchange={pickRoom} />{/if}
  </div>

  {#if roomId && !radiators.length}
    <p class="muted">Cette pièce n’a aucun radiateur&nbsp;: pas de programme à régler.</p>
  {:else if shown}
    {#if mismatch}
      <p class="warn"><Icon name="alert" size={14} /> Les radiateurs de cette pièce n’ont pas le même programme&nbsp;; l’envoi les alignera sur celui-ci.</p>
    {/if}
    <p class="muted legend">Plages <strong>confort</strong> (3 par jour au plus)&nbsp;; le reste du temps est en <strong>éco</strong>. Touchez ou cliquez la barre pour ajouter une plage, glissez-la pour la déplacer, tirez ses bords pour l’ajuster.</p>

    {#if roomId}
      <section class="today">
        <h2>Aujourd’hui</h2>
        <RoomTodayStrip {roomId} height={48} axis program={toWeekProgram(shown)}
          label="{roomName(roomId)}, température d’aujourd’hui et plages de ce programme" />
      </section>
    {/if}

    <div class="week">
      {#each DAYS as d (d)}
        <ProgramDay label={DAY_LABEL[d]} segs={shown[d]} pending={busy} nowMinute={d === today ? parisMinuteOfDay(now) : null}
          collapsible={!desktop.matches} open={shownDay === d} ontoggle={() => (openDay = shownDay === d ? null : d)}
          onchange={(segs) => (draft = { ...draft!, [d]: segs })} />
      {/each}
    </div>

    <section class="tools">
      <h2>Copier</h2>
      <div class="row">
        <label class="from">Du <select bind:value={copyFrom} disabled={busy}>{#each DAYS as d (d)}<option value={d}>{DAY_LABEL[d]}</option>{/each}</select></label>
        <span>vers</span>
      </div>
      <div class="chips">
        {#each DAYS.filter((d) => d !== copyFrom) as d (d)}
          <label class="chip"><input class="visually-hidden" type="checkbox" value={d} bind:group={copyTo} disabled={busy} /><span
              aria-hidden="true" class="box"><Icon name="check" size={12} /></span>{DAY_SHORT[d]}</label>
        {/each}
        <button type="button" class="btn btn-sm" disabled={busy || !copyTo.length} onclick={applyCopy}>Copier</button>
      </div>
      {#if house.rooms.length > 1}
        <h2 class="also">Envoyer aussi à</h2>
        <div class="chips">
          {#each house.rooms.filter((r) => r.id !== roomId) as r (r.id)}
            <label class="chip"><input class="visually-hidden" type="checkbox" value={r.id} bind:group={alsoRooms} disabled={busy} /><span
                aria-hidden="true" class="box"><Icon name="check" size={12} /></span>{r.name}</label>
          {/each}
        </div>
      {/if}
    </section>

    {#if changes.length || statuses.length}
      <section class="send">
        {#if changes.length}
          <h2>Modifications</h2>
          <ul>
            {#each changes as d (d)}
              <li><strong>{DAY_LABEL[d]}</strong>&nbsp;: {fmtSegs(draft![d])} <span class="muted">(avant&nbsp;: {fmtSegs(baseline![d])})</span></li>
            {/each}
          </ul>
        {/if}
        {#if statuses.length}
          <ul class="status">
            {#each statuses as { e, pending, stale } (e.roomId)}
              <li>
                <span>{roomName(e.roomId)}</span>
                {#if stale}
                  <span class="stale"><Icon name="alert" size={14} /> {pending!.error ?? 'Échec de la commande.'} Modifiez puis Envoyer.
                    <button type="button" class="btn btn-icon" aria-label="Ignorer" onclick={() => house.dismiss(e.pendingId)}><Icon name="x" size={16} /></button></span>
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
          <button type="button" class="btn" disabled={busy || !changes.length} onclick={() => (draft = baseline)}>Annuler</button>
          <button type="button" class="btn btn-primary" disabled={busy || (!changes.length && !alsoRooms.length) || invalid || !house.online}
            onclick={send}>Envoyer</button>
        </div>
      </div>
    {/if}
  {/if}
{/if}

<style>
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
