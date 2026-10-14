<script lang="ts">
  import { beforeNavigate } from '$app/navigation';
  import { DAYS, type Day, type Pending } from '$lib/api/types';
  import { run, retry } from '$lib/actions';
  import { api } from '$lib/api/client';
  import Icon from '$lib/components/Icon.svelte';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import ProgramDay from '$lib/components/ProgramDay.svelte';
  import RoomTodayStrip from '$lib/components/RoomTodayStrip.svelte';
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
  <p class="muted" role="status">Chargement…</p>
{:else}
  <div class="rooms" role="group" aria-label="Pièce">
    {#each house.rooms as r (r.id)}
      <button type="button" aria-pressed={roomId === r.id} onclick={() => pickRoom(r.id)}>{r.name}</button>
    {/each}
  </div>

  {#if roomId && !radiators.length}
    <p class="muted">Cette pièce n’a aucun radiateur : pas de programme à régler.</p>
  {:else if shown}
    {#if mismatch}
      <p class="warn"><Icon name="alert" size={14} /> Les radiateurs de cette pièce n’ont pas le même programme ; l’envoi les alignera sur celui-ci.</p>
    {/if}
    <p class="muted legend">Plages <strong>confort</strong> (3 par jour au plus) ; le reste du temps est en <strong>éco</strong>. Cliquez sur la barre pour ajouter, glissez pour déplacer, tirez les bords pour ajuster.</p>
    {#if busy}<p class="muted" role="status">Envoi en cours…</p>{/if}

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
          onchange={(segs) => (draft = { ...draft!, [d]: segs })} />
      {/each}
    </div>

    <section class="tools">
      <h2>Copier</h2>
      <div class="row">
        <label>Du <select bind:value={copyFrom} disabled={busy}>{#each DAYS as d (d)}<option value={d}>{DAY_LABEL[d]}</option>{/each}</select></label>
        <span>vers</span>
        {#each DAYS.filter((d) => d !== copyFrom) as d (d)}
          <label class="chk"><input type="checkbox" value={d} bind:group={copyTo} disabled={busy} />{DAY_SHORT[d]}</label>
        {/each}
        <button type="button" disabled={busy || !copyTo.length} onclick={applyCopy}>Copier</button>
      </div>
      {#if house.rooms.length > 1}
        <div class="row">
          <span>Envoyer aussi à</span>
          {#each house.rooms.filter((r) => r.id !== roomId) as r (r.id)}
            <label class="chk"><input type="checkbox" value={r.id} bind:group={alsoRooms} disabled={busy} />{r.name}</label>
          {/each}
        </div>
      {/if}
    </section>

    <section class="send">
      {#if changes.length}
        <h2>Modifications</h2>
        <ul>
          {#each changes as d (d)}
            <li><strong>{DAY_LABEL[d]}</strong> : {fmtSegs(draft![d])} <span class="muted">(avant : {fmtSegs(baseline![d])})</span></li>
          {/each}
        </ul>
      {/if}
      <div class="row">
        <button type="button" disabled={busy || !changes.length} onclick={() => (draft = baseline)}>Annuler</button>
        <button type="button" class="primary" disabled={busy || (!changes.length && !alsoRooms.length) || invalid} onclick={send}>Envoyer</button>
      </div>
      {#if statuses.length}
        <ul class="status">
          {#each statuses as { e, pending, stale } (e.roomId)}
            <li>
              <span>{roomName(e.roomId)}</span>
              {#if stale}
                <span class="stale"><Icon name="alert" size={14} /> {pending!.error ?? 'Échec de la commande.'} Modifiez puis Envoyer.
                  <button type="button" aria-label="Ignorer" onclick={() => house.dismiss(e.pendingId)}><Icon name="x" size={16} /></button></span>
              {:else}
                <PendingTag {pending} onretry={retryEntry} ondismiss={(id) => house.dismiss(id)} />
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
{/if}

<style>
  h1 {
    font-size: 22px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .rooms {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .rooms button {
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--s1);
    color: var(--mu);
    font-weight: 600;
    cursor: pointer;
  }
  .rooms [aria-pressed='true'] {
    color: var(--tx);
    border-color: var(--mu);
  }
  .legend,
  .warn {
    font-size: 13px;
    margin: 0 0 8px;
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
  .stale button {
    display: inline-grid;
    place-items: center;
    min-height: 44px;
    min-width: 44px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--s2);
    color: var(--tx);
    cursor: pointer;
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
  .chk {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
  }
  select,
  .row button {
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--s2);
    cursor: pointer;
  }
  select {
    border-radius: 8px;
  }
  .row button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    background: var(--tx) !important;
    color: var(--bg);
    font-weight: 600;
  }
  ul {
    margin: 0 0 10px;
    padding-left: 18px;
    font-size: 13px;
  }
</style>
